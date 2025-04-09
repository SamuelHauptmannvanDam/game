// c:\Users\samue\Desktop\game\game.js

const gameContainer = document.getElementById('game-container');
const ui = document.getElementById('ui');
const victoryScreen = document.getElementById('victory');
const restartButton = document.getElementById('restart-button');

// Game parameters
const NUM_BASES = 20;
const BASE_HEALTH = 100;
const BLOB_RADIUS = 8;
const BASE_RADIUS = 20;
const ATTACK_INTERVAL_MIN = 1000;  // Minimum time between bot attacks
const ATTACK_INTERVAL_MAX = 3000;  // Maximum time between bot attacks
const PLAYER_MOVE_SPEED = 3; // Speed for player base movement

// Game state
let bases = [];
let blobs = [];
let gameActive = true;
let playerBaseIndex = 0;  // Index of player's base
let teamCounts = {};      // Count of bases by team color
let lastAttackTimes = []; // Last attack time for each base

// --- State for player movement keys ---
const keysPressed = {
    w: false,
    a: false,
    s: false,
    d: false
};
// ------------------------------------------

// Define team colors (excluding too dark or too light colors)
const teamColors = [
    '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33A6',
    '#33FFF5', '#F5FF33', '#FF8333', '#8333FF', '#33FF83',
    '#FF3347', '#33CEFF', '#CEF133', '#F133CE', '#FFCE33',
    '#33FFCE', '#5733FF', '#FF5733', '#33FF57', '#3357FF'
];

function initGame() {
    bases = [];
    blobs = [];
    gameActive = true;
    teamCounts = {};
    lastAttackTimes = [];
    playerBaseIndex = Math.floor(Math.random() * NUM_BASES);

    // --- Reset key states on init ---
    keysPressed.w = false;
    keysPressed.a = false;
    keysPressed.s = false;
    keysPressed.d = false;
    // ------------------------------------

    // Clear any existing elements
    document.querySelectorAll('.base, .blob, .explosion').forEach(el => el.remove()); // Also clear explosions

    // Create evenly distributed bases
    createEvenlyDistributedBases();

    // Mark player's base
    if (bases[playerBaseIndex] && bases[playerBaseIndex].element) {
        bases[playerBaseIndex].element.classList.add('player-base');
    } else {
        console.error("Failed to find player base element during init.");
        // Handle error, maybe re-assign playerBaseIndex or restart
        // For now, let's try finding the first base of the intended color
        const playerColor = teamColors[playerBaseIndex % teamColors.length];
        const newPlayerIndex = bases.findIndex(b => b.color === playerColor);
        if (newPlayerIndex !== -1) {
            playerBaseIndex = newPlayerIndex;
            if (bases[playerBaseIndex] && bases[playerBaseIndex].element) {
                bases[playerBaseIndex].element.classList.add('player-base');
                console.log("Reassigned player base to index:", playerBaseIndex);
            } else {
                console.error("Still failed to assign player base element.");
                // Consider stopping the game or showing an error message
                gameActive = false;
                return;
            }
        } else {
            console.error("Could not find any base with the player's initial color.");
            // Consider stopping the game or showing an error message
            gameActive = false;
            return;
        }
    }


    updateTeamCountsDisplay();
    victoryScreen.style.display = "none"; // Ensure victory screen is hidden on restart
}

function createEvenlyDistributedBases() {
    // Get game container dimensions
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Create margins to avoid edges
    const margin = 100;
    const usableWidth = width - 2 * margin;
    const usableHeight = height - 2 * margin;

    // Calculate number of rows and columns for grid
    const gridSize = Math.ceil(Math.sqrt(NUM_BASES));
    const cellWidth = usableWidth / gridSize;
    const cellHeight = usableHeight / gridSize;

    // Generate positions in a grid pattern with slight randomness
    const positions = [];

    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            // Ensure we don't create more positions than NUM_BASES
            if (positions.length >= NUM_BASES) break;
            const centerX = margin + col * cellWidth + cellWidth / 2;
            const centerY = margin + row * cellHeight + cellHeight / 2;
            const randomOffsetX = (Math.random() - 0.5) * 0.6 * cellWidth;
            const randomOffsetY = (Math.random() - 0.5) * 0.6 * cellHeight;
            positions.push({
                x: centerX + randomOffsetX,
                y: centerY + randomOffsetY
            });
        }
        if (positions.length >= NUM_BASES) break;
    }

    // Shuffle positions for more randomness if needed (optional)
    // for (let i = positions.length - 1; i > 0; i--) {
    //     const j = Math.floor(Math.random() * (i + 1));
    //     [positions[i], positions[j]] = [positions[j], positions[i]];
    // }

    for (let i = 0; i < NUM_BASES; i++) {
        const position = positions[i];
        const color = teamColors[i % teamColors.length];
        createBase(position.x, position.y, i, color);
        lastAttackTimes[i] = Date.now(); // Initialize last attack time
        if (!teamCounts[color]) {
            teamCounts[color] = 0;
        }
        teamCounts[color]++;
    }
}

function createBase(x, y, id, color) {
    const base = document.createElement('div');
    base.className = 'base';
    base.style.left = `${x - BASE_RADIUS}px`;
    base.style.top = `${y - BASE_RADIUS}px`;
    base.style.backgroundColor = color;
    base.textContent = BASE_HEALTH;
    base.dataset.id = id; // Store id for easier access in event listener

    gameContainer.appendChild(base);

    bases.push({
        element: base,
        x: x,
        y: y,
        id: id,
        health: BASE_HEALTH,
        color: color,
        radius: BASE_RADIUS,
        isActive: true
    });

    // *** Attach click listener directly here ***
    // This listener handles shooting when a base is clicked.
    base.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent click from bubbling to gameContainer
        if (!gameActive) return;

        // Check if playerBaseIndex is valid and points to an active base
        if (playerBaseIndex < 0 || playerBaseIndex >= bases.length || !bases[playerBaseIndex] || !bases[playerBaseIndex].isActive) {
            console.log("Player base is not active or valid, cannot shoot.");
            return; // Player cannot shoot if their base is inactive or invalid
        }

        const targetBaseId = parseInt(event.target.dataset.id, 10); // Get the ID of the clicked base
        const playerBase = bases[playerBaseIndex]; // Get the current player base object

        // Check if the click is on a *different* base than the player's current base
        if (targetBaseId !== playerBase.id) { // Use playerBase.id for comparison
            // Find the actual target base object using the ID
            const targetBase = bases.find(b => b.id === targetBaseId);
            if (targetBase && targetBase.isActive) { // Ensure target is also valid and active
                // Use playerBaseIndex (the *index* in the bases array) for the origin
                fireBlob(playerBaseIndex, targetBase.id); // Pass origin index and target ID
            }
        }
    });
}

function createBlob(originX, originY, targetX, targetY, originColor, originId, targetId) {
    const blob = document.createElement('div');
    blob.className = 'blob';
    blob.style.backgroundColor = originColor;
    blob.style.left = `${originX - BLOB_RADIUS}px`;
    blob.style.top = `${originY - BLOB_RADIUS}px`;

    gameContainer.appendChild(blob);

    const angle = Math.atan2(targetY - originY, targetX - originX);
    const speed = 4;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    blobs.push({
        element: blob,
        x: originX,
        y: originY,
        vx: vx,
        vy: vy,
        color: originColor,
        originId: originId, // Store the ID of the origin base
        targetId: targetId, // Store the ID of the target base
        radius: BLOB_RADIUS
    });
}

function fireBlob(originBaseIndex, targetBaseId) { // Accept origin index and target ID
    const originBase = bases[originBaseIndex];
    const targetBase = bases.find(b => b.id === targetBaseId); // Find target by ID

    // Add checks to ensure bases exist and are active
    if (!originBase || !originBase.isActive || !targetBase || !targetBase.isActive) {
        console.warn("Attempted to fire blob with invalid origin or target base.");
        return;
    }

    // Calculate starting position slightly outside the origin base radius
    const angle = Math.atan2(targetBase.y - originBase.y, targetBase.x - originBase.x);
    const startDist = originBase.radius + BLOB_RADIUS + 1; // Ensure blob starts outside
    const startX = originBase.x + Math.cos(angle) * startDist;
    const startY = originBase.y + Math.sin(angle) * startDist;


    createBlob(
        startX, // Use calculated start position
        startY, // Use calculated start position
        targetBase.x,
        targetBase.y,
        originBase.color,
        originBase.id, // Pass origin base ID
        targetBase.id  // Pass target base ID
    );

    lastAttackTimes[originBaseIndex] = Date.now(); // Update last attack time for the firing base
}

// --- Function to handle player movement ---
// This function runs every frame in the game loop, independent of clicks.
function handlePlayerMovement() {
    // Check if player has a valid base index
    if (playerBaseIndex < 0 || playerBaseIndex >= bases.length) return;

    const playerBase = bases[playerBaseIndex];

    // Ensure player base object exists, is active, and has an element
    if (!playerBase || !playerBase.isActive || !playerBase.element) return;

    let dx = 0;
    let dy = 0;

    // Check which movement keys are currently pressed
    if (keysPressed.w) dy -= 1;
    if (keysPressed.s) dy += 1;
    if (keysPressed.a) dx -= 1;
    if (keysPressed.d) dx += 1;

    // Only move if a movement key is pressed
    if (dx !== 0 || dy !== 0) {
        // Normalize diagonal movement speed to prevent faster diagonal movement
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        if (magnitude > 0) { // Avoid division by zero
            dx = (dx / magnitude) * PLAYER_MOVE_SPEED;
            dy = (dy / magnitude) * PLAYER_MOVE_SPEED;
        }

        // Update the base's logical position
        playerBase.x += dx;
        playerBase.y += dy;

        // Enforce boundaries to keep the base within the game area
        const minX = playerBase.radius;
        const maxX = window.innerWidth - playerBase.radius;
        const minY = playerBase.radius;
        const maxY = window.innerHeight - playerBase.radius;

        playerBase.x = Math.max(minX, Math.min(maxX, playerBase.x));
        playerBase.y = Math.max(minY, Math.min(maxY, playerBase.y));

        // Update the visual element's position on the screen
        // Subtract radius to position based on center
        playerBase.element.style.left = `${playerBase.x - playerBase.radius}px`;
        playerBase.element.style.top = `${playerBase.y - playerBase.radius}px`;
    }
}
// ---------------------------------------------

function updateBlobPositions() {
    for (let i = blobs.length - 1; i >= 0; i--) {
        const blob = blobs[i];
        // Basic check if blob object exists
        if (!blob) {
            blobs.splice(i, 1);
            continue;
        }
        // Check if element exists before trying to manipulate it
        if (!blob.element || !document.body.contains(blob.element)) {
            blobs.splice(i, 1);
            continue;
        }


        blob.x += blob.vx;
        blob.y += blob.vy;
        blob.element.style.left = `${blob.x - blob.radius}px`;
        blob.element.style.top = `${blob.y - blob.radius}px`;

        let blobRemoved = false; // Flag to track if blob was removed in this iteration

        // Check for collisions with bases
        for (let j = 0; j < bases.length; j++) {
            const base = bases[j];
            if (!base || !base.isActive) continue; // Skip inactive or non-existent bases

            const distance = Math.sqrt(Math.pow(blob.x - base.x, 2) + Math.pow(blob.y - base.y, 2));

            // Collision detected
            if (distance < blob.radius + base.radius) {
                handleBlobBaseCollision(blob, base, i);
                blobRemoved = true; // Mark blob as removed
                // Important: break after collision to avoid processing the same blob multiple times
                break;
            }
        }

        // If blob was removed by base collision, skip further checks for this blob
        if (blobRemoved) continue;

        // Check blob-blob collisions only if the blob still exists
        // Re-check blob existence as it might have been removed by handleBlobBaseCollision
        const currentBlob = blobs[i]; // Re-fetch in case array shifted
        if (currentBlob && currentBlob.element) {
            for (let j = blobs.length - 1; j >= 0; j--) {
                // Avoid self-collision and index issues if arrays changed
                if (i === j || i >= blobs.length || j >= blobs.length) continue;

                const otherBlob = blobs[j];
                // Ensure both blobs and their elements exist before checking distance
                if (!otherBlob || !otherBlob.element || !currentBlob || !currentBlob.element) continue;

                const distance = Math.sqrt(Math.pow(currentBlob.x - otherBlob.x, 2) + Math.pow(currentBlob.y - otherBlob.y, 2));

                // Collision between blobs of different colors
                if (distance < currentBlob.radius + otherBlob.radius && currentBlob.color !== otherBlob.color) {
                    createExplosion((currentBlob.x + otherBlob.x) / 2, (currentBlob.y + otherBlob.y) / 2);

                    // Safely remove elements first
                    if (currentBlob.element) currentBlob.element.remove();
                    if (otherBlob.element) otherBlob.element.remove();

                    // Remove from array, carefully handling indices
                    // Determine which index is larger to splice correctly
                    const indexToRemoveFirst = Math.max(i, j);
                    const indexToRemoveSecond = Math.min(i, j);

                    blobs.splice(indexToRemoveFirst, 1);
                    blobs.splice(indexToRemoveSecond, 1);

                    // Since blob 'i' (currentBlob) is removed, break inner loop and let outer loop continue
                    // The outer loop's decrementing 'i' will handle the array shift correctly.
                    blobRemoved = true; // Mark as removed
                    break; // Exit inner loop
                }
            }
        }

        // If blob was removed by blob-blob collision, continue to next iteration of outer loop
        if (blobRemoved) continue;

        // Remove blobs out of bounds only if the blob still exists and has an element
        // Re-check blob existence again
        const finalCheckBlob = blobs[i];
        if (finalCheckBlob && finalCheckBlob.element && (
            finalCheckBlob.x < -finalCheckBlob.radius * 2 || // Give more buffer
            finalCheckBlob.x > window.innerWidth + finalCheckBlob.radius * 2 ||
            finalCheckBlob.y < -finalCheckBlob.radius * 2 ||
            finalCheckBlob.y > window.innerHeight + finalCheckBlob.radius * 2)) {
            finalCheckBlob.element.remove();
            blobs.splice(i, 1);
            // No need to set blobRemoved here as we are at the end of the checks for this blob
        }
    }
}


function handleBlobBaseCollision(blob, base, blobIndex) {
    // Ensure blob and base still exist before proceeding
    if (!blob || !base || !base.isActive) {
        // If blob exists but base doesn't, still remove the blob
        if (blob && blob.element) {
            blob.element.remove();
        }
        // Ensure blob is removed from array if it exists at blobIndex
        if (blobs[blobIndex] === blob) {
            blobs.splice(blobIndex, 1);
        }
        return;
    }

    // If blob hits a friendly base, just remove the blob
    if (blob.color === base.color) {
        if (blob.element) blob.element.remove();
        // Ensure blob is removed from array if it exists at blobIndex
        if (blobs[blobIndex] === blob) {
            blobs.splice(blobIndex, 1);
        }
        return;
    }

    // Blob hits an enemy base
    base.health -= 10; // Damage amount
    if (base.element) { // Check if element exists before updating text
        base.element.textContent = Math.max(0, base.health);
    }
    createExplosion(blob.x, blob.y);

    const originBaseId = blob.originId; // Store origin base ID before potentially removing blob

    // Remove the blob element and from the array
    if (blob.element) blob.element.remove();
    if (blobs[blobIndex] === blob) { // Double check it's the correct blob before splicing
        blobs.splice(blobIndex, 1);
    }


    // Check if base is captured
    if (base.health <= 0) {
        captureBase(base, blob.color, originBaseId); // Pass captured base, new color, and the ID of the base that fired the capturing blob
    }
}


function captureBase(base, newColor, captorOriginId) { // Accept the ID of the base that fired the shot
    // Ensure the base being captured still exists and is active
    if (!base || !base.isActive || !base.element) return;

    // --- Find a valid *active* base of the capturing color ---
    // First, check if the original captor base (by ID) is still valid and active
    let validCaptorBase = bases.find(b => b && b.id === captorOriginId && b.isActive);
    let newPlayerAssignIndex = -1; // Index to potentially assign as the new player base

    if (validCaptorBase && validCaptorBase.color === newColor && validCaptorBase.id !== base.id) {
        // Find the index of this valid captor base
        newPlayerAssignIndex = bases.findIndex(b => b.id === validCaptorBase.id);
    } else {
        // If original captor is invalid (or captured itself), find *any* other active base of the new color
        newPlayerAssignIndex = bases.findIndex(b => b && b.isActive && b.color === newColor && b.id !== base.id);
    }
    // --- End finding valid captor ---


    // Decrement count for old team (only if it exists and count > 0)
    if (teamCounts[base.color] && teamCounts[base.color] > 0) {
        teamCounts[base.color]--;
    }

    const oldColor = base.color;
    const oldPlayerBaseId = (playerBaseIndex >= 0 && playerBaseIndex < bases.length) ? bases[playerBaseIndex]?.id : -1; // Store the ID of the current player base

    base.color = newColor;
    base.element.style.backgroundColor = newColor; // Update visual color

    // Increment count for new team
    if (!teamCounts[newColor]) {
        teamCounts[newColor] = 0;
    }
    teamCounts[newColor]++;

    // Reset health and update display
    base.health = BASE_HEALTH;
    base.element.textContent = base.health;

    // --- Handle player base change ---
    // Check if the *captured* base was the player's base
    if (base.id === oldPlayerBaseId) {
        // Player's current base was captured
        base.element.classList.remove('player-base'); // Remove highlight from captured base

        if (newPlayerAssignIndex !== -1 && bases[newPlayerAssignIndex] && bases[newPlayerAssignIndex].element) {
            // Assign a new active base of the *capturing* color as the player base
            playerBaseIndex = newPlayerAssignIndex; // Assign the *index*
            bases[playerBaseIndex].element.classList.add('player-base');
            console.log(`Player base captured! New player base assigned: Index ${playerBaseIndex}, ID ${bases[playerBaseIndex].id}, Color ${bases[playerBaseIndex].color}`);
        } else {
            // Player lost their base, and no other base of the *capturing* color exists or is active
            // Player is effectively eliminated or becomes an observer
            playerBaseIndex = -1; // Indicate no active player base
            console.log("Player base captured, no replacement found for the capturing team. Player eliminated.");
            // Optionally trigger a game over / spectator mode here
        }
    }
    // --- End handle player base change ---

    updateTeamCountsDisplay();
    checkVictoryCondition();
}


function createExplosion(x, y) {
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    // Center the explosion visually on the impact point
    // Use offsetWidth/Height which might be 0 initially, fallback to fixed size
    const explosionSize = 30;
    explosion.style.left = `${x - explosionSize / 2}px`;
    explosion.style.top = `${y - explosionSize / 2}px`;
    explosion.style.width = `${explosionSize}px`; // Ensure size is set for positioning
    explosion.style.height = `${explosionSize}px`; // Ensure size is set for positioning

    gameContainer.appendChild(explosion);
    // Remove the explosion element after the animation completes
    setTimeout(() => {
        explosion.remove();
    }, 500); // Match animation duration
}

function botAttack() {
    const now = Date.now();
    for (let i = 0; i < bases.length; i++) {
        // Skip player's base OR if player has no base (-1)
        if (i === playerBaseIndex) continue;

        const base = bases[i];
        // Check if base exists, is active, and enough time has passed
        if (!base || !base.isActive || now - lastAttackTimes[i] < getRandomAttackInterval()) {
            continue;
        }


        // Find potential targets (active bases of a different color)
        const potentialTargets = bases.filter(target =>
            target && target.isActive && target.color !== base.color
        );

        if (potentialTargets.length > 0) {
            // Choose a random target from the potential list
            const targetBase = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
            // Fire using the bot's base index 'i' and the target's ID
            fireBlob(i, targetBase.id);
            lastAttackTimes[i] = now; // Reset attack timer *after* firing
        }
    }
}

function getRandomAttackInterval() {
    return ATTACK_INTERVAL_MIN + Math.random() * (ATTACK_INTERVAL_MAX - ATTACK_INTERVAL_MIN);
}

function updateTeamCountsDisplay() {
    ui.innerHTML = ''; // Clear previous counts
    const title = document.createElement('div');
    title.textContent = "Teams:";
    title.style.marginBottom = "10px";
    title.style.fontWeight = "bold";
    ui.appendChild(title);

    // Get player color safely, checking if playerBaseIndex is valid and base is active
    const playerBase = (playerBaseIndex >= 0 && playerBaseIndex < bases.length) ? bases[playerBaseIndex] : null;
    const playerColor = (playerBase && playerBase.isActive) ? playerBase.color : null;

    // Sort colors alphabetically for consistent display order (optional)
    const sortedColors = Object.keys(teamCounts).sort();

    // for (const color in teamCounts) {
    for (const color of sortedColors) { // Iterate over sorted colors
        if (teamCounts[color] > 0) { // Only display teams with active bases
            const teamCount = document.createElement('div');
            teamCount.className = 'team-count';
            // Use a colored square for better visibility
            teamCount.innerHTML = `<span style="display: inline-block; width: 12px; height: 12px; background-color: ${color}; margin-right: 5px; vertical-align: middle;"></span> ${teamCounts[color]} bases`;
            if (playerColor && color === playerColor) {
                teamCount.style.fontWeight = "bold";
                teamCount.innerHTML += " (You)";
            }
            ui.appendChild(teamCount);
        }
    }
}

function checkVictoryCondition() {
    const activeColors = new Set();
    let activeBaseCount = 0;
    bases.forEach(base => {
        if (base && base.isActive) { // Check if base exists and is active
            activeColors.add(base.color);
            activeBaseCount++;
        }
    });

    // Check if only one color remains OR no bases remain
    if (activeColors.size <= 1) {
        gameActive = false; // Stop the game loop

        // Determine winner/loser/draw
        const playerBase = (playerBaseIndex >= 0 && playerBaseIndex < bases.length) ? bases[playerBaseIndex] : null;
        const playerIsActive = playerBase && playerBase.isActive; // Check if the player's *current* base is active

        if (activeColors.size === 1 && playerIsActive && activeColors.has(playerBase.color)) {
            // Player's color is the only one left - VICTORY
            victoryScreen.querySelector('h2').textContent = "Victory!";
            victoryScreen.querySelector('p').textContent = `Your color (${playerBase.color}) has conquered the world!`;
            victoryScreen.style.display = "block";
        } else if (activeColors.size === 1 && (!playerIsActive || !activeColors.has(playerBase.color))) {
            // One color remains, but it's not the player's (either player eliminated or their color lost) - DEFEAT
            const winningColor = activeColors.values().next().value; // Get the winning color
            victoryScreen.querySelector('h2').textContent = "Defeat!";
            victoryScreen.querySelector('p').textContent = `Color ${winningColor} has conquered the world.`;
            victoryScreen.style.display = "block";
        } else if (activeBaseCount === 0) {
            // No bases left - DRAW or mutual destruction
            victoryScreen.querySelector('h2').textContent = "Draw!";
            victoryScreen.querySelector('p').textContent = "All bases have been destroyed.";
            victoryScreen.style.display = "block";
        } else if (playerBaseIndex === -1) {
            // Player was eliminated, but game might continue for bots (or end here)
            // This condition is reached if the player's base was captured and no replacement was found
            victoryScreen.querySelector('h2').textContent = "Defeat!";
            victoryScreen.querySelector('p').textContent = "Your base was captured and your team eliminated.";
            victoryScreen.style.display = "block";
        }
        // Note: The game loop stops when gameActive becomes false.
        // If activeColors.size > 1 but the player is eliminated (playerBaseIndex === -1),
        // the game ends here with a defeat message.
    }
}


function gameLoop() {
    if (!gameActive) return;

    // Handle player movement based on key states each frame
    handlePlayerMovement();

    // Update positions and handle collisions for all blobs
    updateBlobPositions();

    // Let bots decide if they want to attack
    botAttack();

    // Continue the loop on the next available frame
    requestAnimationFrame(gameLoop);
}

// Remove the general gameContainer click listener if it's not needed
// gameContainer.addEventListener('click', (event) => {
//     // General clicks don't do anything specific anymore unless you want
//     // to add shooting towards the click point later.
// });

restartButton.addEventListener('click', () => {
    victoryScreen.style.display = "none";
    initGame(); // Re-initialize the game state
    if (gameActive) { // Only start loop if init didn't fail
        requestAnimationFrame(gameLoop); // Start the game loop again
    }
});

// --- Event listeners for key presses ---
// These update the keysPressed state, which is checked in the gameLoop
window.addEventListener('keydown', (event) => {
    // Prevent browser default actions for WASD if needed (e.g., scrolling)
    // if (['w', 'a', 's', 'd'].includes(event.key.toLowerCase())) {
    //     event.preventDefault();
    // }
    const key = event.key.toLowerCase();
    if (key === 'w') keysPressed.w = true;
    if (key === 'a') keysPressed.a = true;
    if (key === 's') keysPressed.s = true;
    if (key === 'd') keysPressed.d = true;
});

window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'w') keysPressed.w = false;
    if (key === 'a') keysPressed.a = false;
    if (key === 's') keysPressed.s = false;
    if (key === 'd') keysPressed.d = false;
});
// -------------------------------------------

// Initialize and start the game when the DOM is ready
document.addEventListener('DOMContentLoaded', (event) => {
    initGame();
    if (gameActive) { // Only start loop if init didn't fail
        requestAnimationFrame(gameLoop);
    } else {
        console.error("Game initialization failed. Game loop not started.");
        // Optionally display an error message to the user
    }
});
