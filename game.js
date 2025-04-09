/**
 * Global Blob Conquest - Game Logic
 *
 * A simple real-time strategy game where colored bases spawn blobs
 * to attack and capture other bases. The player controls one base
 * using keyboard/mouse or touch controls.
 */

// --- DOM Element References ---
const gameContainer = document.getElementById('game-container');
const ui = document.getElementById('ui');
const victoryScreen = document.getElementById('victory');
const restartButton = document.getElementById('restart-button');
const touchControlMove = document.getElementById('touch-control-move'); // Visual element for move control
const touchControlShoot = document.getElementById('touch-control-shoot'); // Visual element for shoot control

// --- Game Parameters ---
const NUM_BASES = 20;           // Total number of bases on the map
const BASE_HEALTH = 30;         // Initial health of each base
const BLOB_RADIUS = 10;         // Visual radius of blobs (increased from 8)
const BASE_RADIUS = 20;         // Visual radius of bases
const ATTACK_INTERVAL_MIN = 1000; // Minimum time (ms) between bot attacks
const ATTACK_INTERVAL_MAX = 3000; // Maximum time (ms) between bot attacks
const PLAYER_MOVE_SPEED = 2;    // Speed of the player-controlled base
const BLOB_DAMAGE = 10;         // Damage inflicted by a blob on an enemy base
const BLOB_SPEED = 4;           // Movement speed of blobs
const MAX_TEAMS = 10;           // Maximum number of distinct teams (colors/IDs) to generate

// --- Touch Control Configuration ---
const TOUCH_CIRCLE_RADIUS = 40;      // Visual radius (matches CSS width/height / 2)
const TOUCH_CIRCLE_BOTTOM_MARGIN = 30; // Distance from bottom edge
const TOUCH_MOVE_ZONE_WIDTH_RATIO = 0.5; // Left 50% of screen for movement

// --- Game State ---
let bases = [];                 // Array to hold base objects {element, x, y, id, health, color, teamId, radius, isActive}
let blobs = [];                 // Array to hold blob objects {element, x, y, vx, vy, color, originBaseId, targetBaseId, teamId, radius}
let gameActive = true;          // Flag indicating if the game loop should run
let playerBaseIndex = -1;       // Index of the player's base in the `bases` array
let teamCounts = {};            // Object to store the count of bases per team color { color: count }
let lastAttackTimes = [];       // Array to track the last attack time for each base (for bot AI)
let teams = [];                 // Array to hold generated team data { color: string, id: string }

// --- Input State ---
const keysPressed = { w: false, a: false, s: false, d: false }; // Keyboard movement state
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches; // Detect touch capability
let movementTouchId = null;     // ID of the touch currently controlling movement
let touchDx = 0;                // Normalized horizontal movement direction from touch (-1 to 1)
let touchDy = 0;                // Normalized vertical movement direction from touch (-1 to 1)
let moveCircleCenter = { x: 0, y: 0 }; // Center coordinates of the move touch control visual
let shootCircleCenter = { x: 0, y: 0 }; // Center coordinates of the shoot touch control visual

// =============================================================================
// --- Initialization Functions ---
// =============================================================================

/**
 * Initializes or resets the game state.
 */
function initGame() {
    console.log("Initializing game...");
    bases = [];
    blobs = [];
    gameActive = true;
    teamCounts = {};
    lastAttackTimes = [];
    playerBaseIndex = -1; // Reset player index

    // Reset input states
    keysPressed.w = false; keysPressed.a = false; keysPressed.s = false; keysPressed.d = false;
    movementTouchId = null; touchDx = 0; touchDy = 0;

    // Clear existing game elements from the DOM
    document.querySelectorAll('.base, .blob, .explosion').forEach(el => el.remove());

    // Generate team data (colors and IDs)
    teams = generateTeams(MAX_TEAMS);

    // Setup touch controls (positions visuals if on touch device)
    setupTouchControls();

    // Create and distribute bases
    createEvenlyDistributedBases();

    // Assign a random base to the player if bases were created
    if (bases.length > 0) {
        playerBaseIndex = Math.floor(Math.random() * bases.length);
        assignPlayerBase();
    } else {
        console.error("No bases were created. Cannot assign player base.");
        gameActive = false; // Stop game if setup failed
    }

    updateTeamCountsDisplay();
    victoryScreen.style.display = "none";
    console.log("Game initialization complete.");
}

/**
 * Calculates and positions the visual touch control elements if on a touch device.
 */
function setupTouchControls() {
    if (!isTouchDevice) {
        touchControlMove.style.display = 'none';
        touchControlShoot.style.display = 'none';
        return;
    }

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Position centers: Left circle at 1/4 width, Right circle at 3/4 width
    moveCircleCenter.x = screenWidth * 0.25;
    shootCircleCenter.x = screenWidth * 0.75;

    // Common Y position near the bottom
    const commonY = screenHeight - TOUCH_CIRCLE_BOTTOM_MARGIN - TOUCH_CIRCLE_RADIUS;
    moveCircleCenter.y = commonY;
    shootCircleCenter.y = commonY;

    // Update visual element positions (top-left corner)
    touchControlMove.style.left = `${moveCircleCenter.x - TOUCH_CIRCLE_RADIUS}px`;
    touchControlMove.style.top = `${moveCircleCenter.y - TOUCH_CIRCLE_RADIUS}px`;
    touchControlMove.style.display = 'block'; // Make visible

    touchControlShoot.style.left = `${shootCircleCenter.x - TOUCH_CIRCLE_RADIUS}px`;
    touchControlShoot.style.top = `${shootCircleCenter.y - TOUCH_CIRCLE_RADIUS}px`;
    touchControlShoot.style.display = 'block'; // Make visible

    console.log("Touch controls positioned:", moveCircleCenter, shootCircleCenter);
}

/**
 * Creates base objects and distributes them somewhat evenly across the screen.
 */
function createEvenlyDistributedBases() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const margin = 80; // Increased margin to keep bases further from edges

    // Calculate usable area, considering touch controls at the bottom if present
    const usableWidth = width - 2 * margin;
    const bottomClearance = isTouchDevice ? (TOUCH_CIRCLE_BOTTOM_MARGIN + TOUCH_CIRCLE_RADIUS * 2 + 30) : 0; // Extra buffer
    const usableHeight = height - 2 * margin - bottomClearance;

    // Ensure usable dimensions are positive
    if (usableWidth <= 0 || usableHeight <= 0) {
        console.error("Usable screen area is too small for base distribution.", { usableWidth, usableHeight });
        // Fallback: Create a single base in the center if possible
        if (NUM_BASES > 0 && teams.length > 0) {
            const teamInfo = teams[0];
            createBase(width / 2, height / 2, 0, teamInfo.color, teamInfo.id); // Pass ID
            lastAttackTimes[0] = Date.now();
            teamCounts[teamInfo.color] = 1;
        }
        return; // Stop further distribution
    }

    const numBasesToCreate = Math.min(NUM_BASES, teams.length * 10); // Limit bases if teams are few, avoid excessive clustering
    const gridSize = Math.ceil(Math.sqrt(numBasesToCreate));
    const cellWidth = usableWidth / Math.max(1, gridSize);
    const cellHeight = usableHeight / Math.max(1, gridSize);
    const positions = [];

    // Generate grid positions with randomization within cells
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            if (positions.length >= numBasesToCreate) break;

            const centerX = margin + col * cellWidth + cellWidth / 2;
            const centerY = margin + row * cellHeight + cellHeight / 2; // Start from top margin

            const randomOffsetX = (Math.random() - 0.5) * 0.7 * cellWidth; // Slightly more spread
            const randomOffsetY = (Math.random() - 0.5) * 0.7 * cellHeight;

            positions.push({
                x: Math.round(centerX + randomOffsetX), // Use integers for positions
                y: Math.round(centerY + randomOffsetY)
            });
        }
        if (positions.length >= numBasesToCreate) break;
    }

    // Shuffle positions for better initial distribution randomness
    positions.sort(() => Math.random() - 0.5);

    // Create bases using the calculated positions and generated team data
    for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const teamIndex = i % teams.length; // Cycle through generated teams
        const teamInfo = teams[teamIndex];

        createBase(position.x, position.y, i, teamInfo.color, teamInfo.id); // Pass team ID
        lastAttackTimes[i] = Date.now(); // Initialize attack timer

        // Initialize or increment team counts
        teamCounts[teamInfo.color] = (teamCounts[teamInfo.color] || 0) + 1;
    }
    console.log(`Created ${bases.length} bases.`);
}

/**
 * Creates a single base element and its corresponding state object.
 * @param {number} x - Center X coordinate.
 * @param {number} y - Center Y coordinate.
 * @param {number} id - Unique numerical ID for the base (its index).
 * @param {string} color - Hex color code for the base.
 * @param {string} teamId - 4-letter uppercase team identifier.
 */
function createBase(x, y, id, color, teamId) {
    const baseElement = document.createElement('div');
    baseElement.className = 'base';
    baseElement.style.left = `${x - BASE_RADIUS}px`;
    baseElement.style.top = `${y - BASE_RADIUS}px`;
    baseElement.style.backgroundColor = color;
    baseElement.style.width = `${BASE_RADIUS * 2}px`; // Ensure size matches radius
    baseElement.style.height = `${BASE_RADIUS * 2}px`;
    baseElement.textContent = BASE_HEALTH;
    baseElement.dataset.id = id;
    gameContainer.appendChild(baseElement);

    bases.push({
        element: baseElement,
        x: x,
        y: y,
        id: id,
        health: BASE_HEALTH,
        color: color,
        teamId: teamId, // Store the 4-letter team ID
        radius: BASE_RADIUS,
        isActive: true
    });
}

/**
 * Assigns the 'player-base' class to the designated player base element.
 * Handles cases where the initial random index might be invalid.
 */
function assignPlayerBase() {
    if (playerBaseIndex < 0 || playerBaseIndex >= bases.length || !bases[playerBaseIndex]) {
        console.warn(`Initial player base index ${playerBaseIndex} is invalid. Attempting to find a valid base.`);
        // Try to find the first active base
        const firstActiveBaseIndex = bases.findIndex(b => b && b.isActive && b.element);
        if (firstActiveBaseIndex !== -1) {
            playerBaseIndex = firstActiveBaseIndex;
            console.log(`Reassigned player base to first active base: Index ${playerBaseIndex}`);
        } else {
            console.error("Could not find any active base to assign to player. Game cannot continue.");
            gameActive = false;
            return; // Exit if no base can be assigned
        }
    }

    // Assign the class to the valid player base
    const playerBase = bases[playerBaseIndex];
    if (playerBase && playerBase.element) {
        playerBase.element.classList.add('player-base');
        console.log(`Player base assigned: Index ${playerBaseIndex}, Color ${playerBase.color}, ID ${playerBase.teamId}`);
    } else {
        // This case should ideally not be reached after the checks above
        console.error(`Failed to assign player-base class to base at index ${playerBaseIndex}.`);
        gameActive = false;
    }
}

// =============================================================================
// --- Game Object Creation Functions ---
// =============================================================================

/**
 * Creates a blob element and its corresponding state object.
 * @param {number} originX - Starting X coordinate.
 * @param {number} originY - Starting Y coordinate.
 * @param {number} targetX - Target X coordinate (for direction calculation).
 * @param {number} targetY - Target Y coordinate (for direction calculation).
 * @param {string} originColor - Hex color code of the originating base.
 * @param {number} originBaseId - Numerical ID of the originating base.
 * @param {number | null} targetBaseId - Numerical ID of the target base (if applicable, null otherwise).
 * @param {string} teamId - 4-letter uppercase team identifier of the originating base.
 */
function createBlob(originX, originY, targetX, targetY, originColor, originBaseId, targetBaseId, teamId) {
    const blobElement = document.createElement('div');
    blobElement.className = 'blob';
    blobElement.style.backgroundColor = originColor;
    blobElement.style.left = `${originX - BLOB_RADIUS}px`;
    blobElement.style.top = `${originY - BLOB_RADIUS}px`;
    blobElement.style.width = `${BLOB_RADIUS * 2}px`; // Ensure size matches radius
    blobElement.style.height = `${BLOB_RADIUS * 2}px`;
    // blobElement.textContent = teamId; // REMOVED: Display the 4-letter ID
    gameContainer.appendChild(blobElement);

    const angle = Math.atan2(targetY - originY, targetX - originX);
    const vx = Math.cos(angle) * BLOB_SPEED;
    const vy = Math.sin(angle) * BLOB_SPEED;

    blobs.push({
        element: blobElement,
        x: originX,
        y: originY,
        vx: vx,
        vy: vy,
        color: originColor,
        originBaseId: originBaseId,
        targetBaseId: targetBaseId, // Can be null if fired by player click
        teamId: teamId, // Store the 4-letter team ID
        radius: BLOB_RADIUS
    });
}

/**
 * Creates a visual explosion effect at a given position.
 * @param {number} x - Center X coordinate of the explosion.
 * @param {number} y - Center Y coordinate of the explosion.
 */
function createExplosion(x, y) {
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    const explosionSize = 30; // Match CSS size
    explosion.style.left = `${x - explosionSize / 2}px`;
    explosion.style.top = `${y - explosionSize / 2}px`;
    // Width/Height are set by CSS animation, but setting here ensures initial state if needed
    // explosion.style.width = `${explosionSize}px`;
    // explosion.style.height = `${explosionSize}px`;
    gameContainer.appendChild(explosion);
    // Remove the element after the animation completes (match CSS duration)
    setTimeout(() => {
        explosion.remove();
    }, 500); // 0.5s animation duration
}

// =============================================================================
// --- Game Logic Functions ---
// =============================================================================

/**
 * Fires a blob from a specified base towards a target coordinate.
 * @param {number} originBaseIndex - Index of the originating base in the `bases` array.
 * @param {number} targetX - Target X coordinate.
 * @param {number} targetY - Target Y coordinate.
 */
function fireBlob(originBaseIndex, targetX, targetY) {
    if (originBaseIndex < 0 || originBaseIndex >= bases.length) {
        console.warn("Invalid origin base index for firing blob:", originBaseIndex);
        return;
    }
    const originBase = bases[originBaseIndex];
    if (!originBase || !originBase.isActive) {
        // console.warn("Attempted to fire from inactive or non-existent base:", originBaseIndex);
        return; // Don't fire from inactive bases
    }

    // Calculate starting position just outside the base radius
    const angle = Math.atan2(targetY - originBase.y, targetX - originBase.x);
    const startDist = originBase.radius + BLOB_RADIUS + 2; // Add small buffer
    const startX = originBase.x + Math.cos(angle) * startDist;
    const startY = originBase.y + Math.sin(angle) * startDist;

    // Pass necessary info, including the base's teamId
    createBlob(startX, startY, targetX, targetY, originBase.color, originBase.id, null, originBase.teamId);

    // Reset attack timer for the firing base (relevant for bots)
    if (lastAttackTimes[originBaseIndex] !== undefined) {
        lastAttackTimes[originBaseIndex] = Date.now();
    }
}

/**
 * Handles player base movement based on keyboard or touch input.
 */
function handlePlayerMovement() {
    if (playerBaseIndex < 0 || playerBaseIndex >= bases.length) return; // No player base active
    const playerBase = bases[playerBaseIndex];
    if (!playerBase || !playerBase.isActive || !playerBase.element) return; // Base gone or inactive

    let dx = 0;
    let dy = 0;

    // Determine movement vector based on input type
    if (isTouchDevice && movementTouchId !== null) {
        // Use normalized direction from touch input
        dx = touchDx;
        dy = touchDy;
    } else if (!isTouchDevice) {
        // Use keyboard input
        if (keysPressed.w) dy -= 1;
        if (keysPressed.s) dy += 1;
        if (keysPressed.a) dx -= 1;
        if (keysPressed.d) dx += 1;
    }

    // Apply movement if there is input
    if (dx !== 0 || dy !== 0) {
        // Normalize the direction vector if needed (keyboard diagonal movement)
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        let moveX = 0;
        let moveY = 0;
        if (magnitude > 0) {
            // Apply speed to the normalized direction
            moveX = (dx / magnitude) * PLAYER_MOVE_SPEED;
            moveY = (dy / magnitude) * PLAYER_MOVE_SPEED;
        }

        // Update base position
        playerBase.x += moveX;
        playerBase.y += moveY;

        // Clamp position to screen bounds, considering base radius
        const minX = playerBase.radius;
        const maxX = window.innerWidth - playerBase.radius;
        const minY = playerBase.radius;
        const maxY = window.innerHeight - playerBase.radius;
        playerBase.x = Math.max(minX, Math.min(maxX, playerBase.x));
        playerBase.y = Math.max(minY, Math.min(maxY, playerBase.y));

        // Update the element's style
        playerBase.element.style.left = `${playerBase.x - playerBase.radius}px`;
        playerBase.element.style.top = `${playerBase.y - playerBase.radius}px`;
    }
}

/**
 * Updates the position of all active blobs and handles collisions.
 */
function updateBlobPositions() {
    // Iterate backwards to safely remove elements during iteration
    for (let i = blobs.length - 1; i >= 0; i--) {
        const blob = blobs[i];

        // Basic sanity check and cleanup for invalid blob states
        if (!blob || !blob.element || !document.body.contains(blob.element)) {
            blobs.splice(i, 1);
            continue;
        }

        // Update position
        blob.x += blob.vx;
        blob.y += blob.vy;
        blob.element.style.left = `${blob.x - blob.radius}px`;
        blob.element.style.top = `${blob.y - blob.radius}px`;

        let blobRemoved = false;

        // 1. Check for collision with bases
        for (let j = 0; j < bases.length; j++) {
            const base = bases[j];
            if (!base || !base.isActive) continue; // Skip inactive bases

            const distance = Math.sqrt(Math.pow(blob.x - base.x, 2) + Math.pow(blob.y - base.y, 2));

            // Collision detected if distance is less than sum of radii
            if (distance < blob.radius + base.radius) {
                handleBlobBaseCollision(blob, base, i);
                blobRemoved = true; // Collision handler removes the blob
                break; // A blob can only collide with one base per frame
            }
        }
        if (blobRemoved) continue; // Move to the next blob if this one was removed

        // 2. Check for collision with other blobs (optional, can be performance intensive)
        // Iterate backwards again for the inner loop
        for (let j = blobs.length - 1; j >= 0; j--) {
            // Skip self-collision and ensure indices are valid after potential splices
            if (i === j || i >= blobs.length || j >= blobs.length) continue;

            const otherBlob = blobs[j];
            if (!otherBlob || !otherBlob.element) continue; // Skip invalid blobs

            // Only check collisions between blobs of different colors
            if (blob.color !== otherBlob.color) {
                const distance = Math.sqrt(Math.pow(blob.x - otherBlob.x, 2) + Math.pow(blob.y - otherBlob.y, 2));

                // Collision detected
                if (distance < blob.radius + otherBlob.radius) {
                    createExplosion((blob.x + otherBlob.x) / 2, (blob.y + otherBlob.y) / 2);

                    // Remove both blob elements from DOM
                    if (blob.element) blob.element.remove();
                    if (otherBlob.element) otherBlob.element.remove();

                    // Remove both blobs from the array carefully, considering indices
                    // Remove the one with the higher index first to avoid shifting issues
                    const indexToRemoveFirst = Math.max(i, j);
                    const indexToRemoveSecond = Math.min(i, j);

                    blobs.splice(indexToRemoveFirst, 1);
                    // Check if the second index is still valid after the first removal
                    if (indexToRemoveSecond < blobs.length) {
                        blobs.splice(indexToRemoveSecond, 1);
                    }

                    blobRemoved = true;
                    break; // Exit inner loop after handling collision for blob 'i'
                }
            }
        }
        if (blobRemoved) continue; // Move to the next blob if this one was removed

        // 3. Check if blob is out of bounds and remove it
        const currentBlob = blobs[i]; // Re-check blob exists after potential collision removals
        if (currentBlob && currentBlob.element) {
            const outOfBounds =
                currentBlob.x < -currentBlob.radius * 2 || currentBlob.x > window.innerWidth + currentBlob.radius * 2 ||
                currentBlob.y < -currentBlob.radius * 2 || currentBlob.y > window.innerHeight + currentBlob.radius * 2;

            if (outOfBounds) {
                currentBlob.element.remove();
                blobs.splice(i, 1);
            }
        }
    }
}

/**
 * Handles the collision between a blob and a base.
 * @param {object} blob - The blob object involved in the collision.
 * @param {object} base - The base object involved in the collision.
 * @param {number} blobIndex - The index of the blob in the `blobs` array.
 */
function handleBlobBaseCollision(blob, base, blobIndex) {
    // Ensure both objects are still valid before proceeding
    if (!blob || !base || !base.isActive) {
        // Cleanup if something went wrong
        if (blob && blob.element) blob.element.remove();
        // Safely remove blob from array if index is still valid
        if (blobIndex < blobs.length && blobs[blobIndex] === blob) {
            blobs.splice(blobIndex, 1);
        }
        return;
    }

    // If blob and base are the same color, blob is absorbed (just remove blob)
    if (blob.color === base.color) {
        if (blob.element) blob.element.remove();
        if (blobIndex < blobs.length && blobs[blobIndex] === blob) {
            blobs.splice(blobIndex, 1);
        }
        return;
    }

    // --- Collision between different colors ---

    // Damage the base
    base.health -= BLOB_DAMAGE;
    if (base.element) {
        base.element.textContent = Math.max(0, base.health); // Update health display, minimum 0
    }

    // Create explosion effect
    createExplosion(blob.x, blob.y);

    // Remove the blob element and object
    if (blob.element) blob.element.remove();
    if (blobIndex < blobs.length && blobs[blobIndex] === blob) {
        blobs.splice(blobIndex, 1);
    }

    // Check if the base was captured
    if (base.health <= 0) {
        captureBase(base, blob.color, blob.teamId); // Pass the capturing blob's color and teamId
    }
}

/**
 * Handles the capture of a base by a different team.
 * @param {object} base - The base object being captured.
 * @param {string} newColor - The color of the capturing team.
 * @param {string} newTeamId - The team ID of the capturing team.
 */
function captureBase(base, newColor, newTeamId) {
    if (!base || !base.isActive || !base.element) return; // Base already gone or inactive

    const oldColor = base.color;
    const oldPlayerBaseId = (playerBaseIndex >= 0 && playerBaseIndex < bases.length && bases[playerBaseIndex]) ? bases[playerBaseIndex].id : -1;

    // Decrement count for the old color
    if (teamCounts[oldColor] > 0) {
        teamCounts[oldColor]--;
    }

    // Update base properties
    base.color = newColor;
    base.teamId = newTeamId; // Update the team ID
    base.element.style.backgroundColor = newColor;
    base.health = BASE_HEALTH; // Reset health
    base.element.textContent = base.health;

    // Increment count for the new color
    teamCounts[newColor] = (teamCounts[newColor] || 0) + 1;

    // Check if the captured base *was* the player's base
    if (base.id === oldPlayerBaseId) {
        // Player's base was captured. The player continues controlling this base,
        // but it now belongs to the capturing team. The 'player-base' class remains.
        // playerBaseIndex does NOT change here.
        console.log(`Player base (ID ${base.id}) captured by Team ${newTeamId} (${newColor}). Player continues control.`);
        // Update the player's base visual style immediately if needed (though color change handles it)
        // No need to remove/add 'player-base' class.
    }

    // Update UI and check for game end condition
    updateTeamCountsDisplay();
    checkVictoryCondition();
}

/**
 * Simple AI for non-player bases to attack others.
 */
function botAttack() {
    const now = Date.now();
    for (let i = 0; i < bases.length; i++) {
        // Skip player base and inactive bases
        if (i === playerBaseIndex || !bases[i] || !bases[i].isActive) continue;

        const base = bases[i];

        // Check if enough time has passed since the last attack
        if (now - lastAttackTimes[i] >= getRandomAttackInterval()) {
            // Find potential targets (active bases of a different color)
            const potentialTargets = bases.filter(target =>
                target && target.isActive && target.color !== base.color
            );

            if (potentialTargets.length > 0) {
                // Choose a random target from the list
                const targetBase = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
                // Fire a blob towards the target base
                fireBlob(i, targetBase.x, targetBase.y);
                // Reset the attack timer (done within fireBlob now)
                // lastAttackTimes[i] = now;
            }
        }
    }
}

/**
 * Checks if a victory or draw condition has been met.
 */
function checkVictoryCondition() {
    const activeColors = new Set();
    let activeBaseCount = 0;

    // Count active bases and distinct active colors
    bases.forEach(base => {
        if (base && base.isActive) {
            activeColors.add(base.color);
            activeBaseCount++;
        }
    });

    // --- Victory/Defeat Condition ---
    if (activeColors.size === 1 && activeBaseCount > 0) {
        gameActive = false;
        const winningColor = activeColors.values().next().value;
        const playerBase = (playerBaseIndex >= 0 && playerBaseIndex < bases.length) ? bases[playerBaseIndex] : null;
        const playerIsActiveAndExists = playerBase && playerBase.isActive;

        if (playerIsActiveAndExists && playerBase.color === winningColor) {
            // Player's team won
            victoryScreen.querySelector('h2').textContent = "Victory!";
            victoryScreen.querySelector('p').textContent = `Your color (${playerBase.color}) conquered!`;
        } else {
            // Player's team lost or player was eliminated
            victoryScreen.querySelector('h2').textContent = "Defeat!";
            if (playerIsActiveAndExists) {
                victoryScreen.querySelector('p').textContent = `Color ${winningColor} conquered. You ended on team ${playerBase.color}.`;
            } else {
                victoryScreen.querySelector('p').textContent = `Color ${winningColor} conquered. Your base was destroyed.`;
            }
        }
        victoryScreen.style.display = "block";
    }
    // --- Draw Condition ---
    else if (activeBaseCount === 0) {
        gameActive = false;
        victoryScreen.querySelector('h2').textContent = "Draw!";
        victoryScreen.querySelector('p').textContent = "All bases have been destroyed.";
        victoryScreen.style.display = "block";
    }
    // --- Game Continues ---
    // else: More than one color active, or zero colors but bases still exist (shouldn't happen with current logic)
}

// =============================================================================
// --- UI and Display Functions ---
// =============================================================================

/**
 * Updates the team counts display in the UI panel.
 */
function updateTeamCountsDisplay() {
    ui.innerHTML = ''; // Clear previous content
    const title = document.createElement('div');
    title.textContent = "Teams:";
    title.style.marginBottom = "10px";
    title.style.fontWeight = "bold";
    ui.appendChild(title);

    // Get current player base info safely
    const playerBase = (playerBaseIndex >= 0 && playerBaseIndex < bases.length) ? bases[playerBaseIndex] : null;
    const playerColor = (playerBase && playerBase.isActive) ? playerBase.color : null;

    // Sort colors alphabetically for consistent display order
    const sortedColors = Object.keys(teamCounts).sort();

    for (const color of sortedColors) {
        // Only display teams that currently have bases
        if (teamCounts[color] > 0) {
            const teamCountElement = document.createElement('div');
            teamCountElement.className = 'team-count';

            // Create the display string with color swatch and count
            teamCountElement.innerHTML = `
                <span style="display: inline-block; width: 12px; height: 12px; background-color: ${color}; margin-right: 5px; vertical-align: middle; border: 1px solid #555;"></span>
                ${teamCounts[color]} base${teamCounts[color] > 1 ? 's' : ''}
            `;

            // Highlight the player's current team
            if (playerColor && color === playerColor) {
                teamCountElement.style.fontWeight = "bold";
                teamCountElement.innerHTML += " (You)";
            }
            ui.appendChild(teamCountElement);
        }
    }
}

// =============================================================================
// --- Helper Functions ---
// =============================================================================

/**
 * Generates a random time interval for bot attacks.
 * @returns {number} Time in milliseconds.
 */
function getRandomAttackInterval() {
    return ATTACK_INTERVAL_MIN + Math.random() * (ATTACK_INTERVAL_MAX - ATTACK_INTERVAL_MIN);
}

/**
 * Generates a random hexadecimal color code with minimum brightness.
 * @returns {string} A random hex color string (e.g., '#A5F3B1').
 */
function generateRandomHexColor() {
    let color;
    let r, g, b, brightness;
    const minBrightness = 90; // Ensure colors are reasonably bright

    do {
        color = '#';
        for (let i = 0; i < 6; i++) {
            color += '0123456789ABCDEF'[Math.floor(Math.random() * 16)];
        }
        // Check brightness
        r = parseInt(color.substring(1, 3), 16);
        g = parseInt(color.substring(3, 5), 16);
        b = parseInt(color.substring(5, 7), 16);
        brightness = (r * 299 + g * 587 + b * 114) / 1000; // Simple brightness formula
    } while (brightness < minBrightness);

    return color;
}

/**
 * Generates a unique 4-letter uppercase ID.
 * @param {Set<string>} existingIds - A Set containing already used IDs.
 * @returns {string} A unique 4-letter ID.
 */
function generateUniqueTeamId(existingIds) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const idLength = 4;
    let id;
    do {
        id = '';
        for (let i = 0; i < idLength; i++) {
            id += characters.charAt(Math.floor(Math.random() * characters.length));
        }
    } while (existingIds.has(id)); // Ensure uniqueness
    existingIds.add(id); // Add the new unique ID to the set
    return id;
}

/**
 * Generates an array of team objects, each with a unique color and ID.
 * @param {number} count - The desired number of teams.
 * @returns {Array<{color: string, id: string}>} An array of team objects.
 */
function generateTeams(count) {
    const generatedTeams = [];
    const usedIds = new Set();
    const usedColors = new Set();
    const maxColorGenAttempts = 20; // Prevent infinite loop if unique colors are hard to find

    for (let i = 0; i < count; i++) {
        let color;
        let attempts = 0;
        // Attempt to generate a unique color
        do {
            color = generateRandomHexColor();
            attempts++;
        } while (usedColors.has(color) && attempts < maxColorGenAttempts);
        // If unique color not found after attempts, reuse is allowed (though unlikely with hex)
        usedColors.add(color);

        const id = generateUniqueTeamId(usedIds);
        generatedTeams.push({ color: color, id: id });
    }
    console.log(`Generated ${generatedTeams.length} teams.`);
    return generatedTeams;
}


// =============================================================================
// --- Game Loop ---
// =============================================================================

/**
 * The main game loop, called repeatedly using requestAnimationFrame.
 */
function gameLoop() {
    if (!gameActive) {
        console.log("Game loop stopped.");
        return; // Stop the loop if the game is no longer active
    }

    // Update game state
    handlePlayerMovement();
    updateBlobPositions();
    botAttack();
    // Note: Victory check is handled within captureBase/collision logic

    // Request the next frame
    requestAnimationFrame(gameLoop);
}

// =============================================================================
// --- Event Listeners ---
// =============================================================================

// --- Restart Button ---
restartButton.addEventListener('click', () => {
    console.log("Restart button clicked.");
    victoryScreen.style.display = "none";
    initGame(); // Re-initialize the game
    if (gameActive) {
        requestAnimationFrame(gameLoop); // Start the loop again if init was successful
    } else {
        console.error("Game initialization failed after restart. Game loop not started.");
    }
});

// --- Input Handling (Conditional based on device type) ---

if (isTouchDevice) {
    console.log("Setting up Touch Event Listeners.");
    // --- Touch Event Handlers ---

    /** Handles the start of a touch interaction. */
    function handleTouchStart(event) {
        if (!gameActive) return;
        event.preventDefault(); // Prevent default browser actions (scrolling, zooming)

        const screenWidth = window.innerWidth;

        for (let touch of event.changedTouches) {
            const touchX = touch.clientX;
            const touchY = touch.clientY;
            const touchId = touch.identifier;

            // --- Determine Intent: Move (Left Side) vs. Shoot (Right Side) ---

            // Check if touch is in the movement zone (left side)
            if (touchX < screenWidth * TOUCH_MOVE_ZONE_WIDTH_RATIO) {
                // Start a *new* movement touch only if one isn't already active
                if (movementTouchId === null) {
                    movementTouchId = touchId;
                    // Calculate initial movement vector relative to the move circle's center
                    const deltaX = touchX - moveCircleCenter.x;
                    const deltaY = touchY - moveCircleCenter.y;
                    const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                    // Set normalized direction
                    touchDx = (magnitude > 0) ? deltaX / magnitude : 0;
                    touchDy = (magnitude > 0) ? deltaY / magnitude : 0;
                    // console.log(`Movement touch started (ID: ${touchId}): dx=${touchDx.toFixed(2)}, dy=${touchDy.toFixed(2)}`);
                }
            }
            // Touch is in the shooting zone (right side)
            else {
                // Check if player has a valid base before shooting
                if (playerBaseIndex >= 0 && playerBaseIndex < bases.length && bases[playerBaseIndex]?.isActive) {
                    const playerBase = bases[playerBaseIndex];

                    // Calculate shooting direction relative to the SHOOT circle's center
                    const deltaX = touchX - shootCircleCenter.x;
                    const deltaY = touchY - shootCircleCenter.y;
                    const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                    // Only shoot if the touch is not exactly on the center (provides a direction)
                    if (magnitude > 0) {
                        const shootDirX = deltaX / magnitude;
                        const shootDirY = deltaY / magnitude;

                        // Calculate a target point far away in that direction from the player base
                        const targetDist = 2000; // Arbitrarily large distance
                        const targetX = playerBase.x + shootDirX * targetDist;
                        const targetY = playerBase.y + shootDirY * targetDist;

                        // console.log(`Shoot touch detected (ID: ${touchId}). Firing towards (${targetX.toFixed(0)}, ${targetY.toFixed(0)})`);
                        fireBlob(playerBaseIndex, targetX, targetY);
                    } else {
                        // console.log("Tap exactly on shoot center, skipping shot.");
                    }
                } else {
                    // console.log("Player base inactive or invalid, cannot shoot via touch.");
                }
            }
        }
    }

    /** Handles movement updates for an active touch. */
    function handleTouchMove(event) {
        if (!gameActive || movementTouchId === null) return; // Only process if a movement touch is active
        event.preventDefault();

        for (let touch of event.changedTouches) {
            // Find the touch that is controlling movement
            if (touch.identifier === movementTouchId) {
                // Update movement vector based on current position relative to MOVE circle's center
                const touchX = touch.clientX;
                const touchY = touch.clientY;
                const deltaX = touchX - moveCircleCenter.x;
                const deltaY = touchY - moveCircleCenter.y;
                const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                // Update normalized direction
                touchDx = (magnitude > 0) ? deltaX / magnitude : 0;
                touchDy = (magnitude > 0) ? deltaY / magnitude : 0;
                // console.log(`Movement touch moved (ID: ${touchId}): dx=${touchDx.toFixed(2)}, dy=${touchDy.toFixed(2)}`);
                break; // Found the movement touch, no need to check others
            }
        }
    }

    /** Handles the end of a touch interaction. */
    function handleTouchEnd(event) {
        if (!gameActive) return;
        // No preventDefault needed usually for touchend/touchcancel

        for (let touch of event.changedTouches) {
            // If the touch ending was the one controlling movement, stop movement
            if (touch.identifier === movementTouchId) {
                movementTouchId = null;
                touchDx = 0;
                touchDy = 0;
                // console.log(`Movement touch ended (ID: ${touch.identifier})`);
                break; // Found the movement touch
            }
            // No specific action needed for ending a shooting touch (it's instantaneous on touchstart)
        }
    }

    // Add touch listeners to the game container
    // Use passive: false because we call preventDefault()
    gameContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    gameContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    gameContainer.addEventListener('touchend', handleTouchEnd, { passive: false });
    gameContainer.addEventListener('touchcancel', handleTouchEnd, { passive: false }); // Treat cancel like end

    // Recalculate touch control positions on resize/orientation change
    window.addEventListener('resize', setupTouchControls);
    window.addEventListener('orientationchange', setupTouchControls);

} else {
    console.log("Setting up Keyboard & Mouse Listeners.");
    // --- Keyboard & Mouse Listeners (Only for non-touch devices) ---
    gameContainer.style.cursor = 'crosshair'; // Set cursor only for non-touch

    window.addEventListener('keydown', (event) => {
        if (!gameActive) return;
        const key = event.key.toLowerCase();
        if (key === 'w' || key === 'arrowup') keysPressed.w = true;
        if (key === 'a' || key === 'arrowleft') keysPressed.a = true;
        if (key === 's' || key === 'arrowdown') keysPressed.s = true;
        if (key === 'd' || key === 'arrowright') keysPressed.d = true;
    });

    window.addEventListener('keyup', (event) => {
        // No gameActive check needed here, always reset keys
        const key = event.key.toLowerCase();
        if (key === 'w' || key === 'arrowup') keysPressed.w = false;
        if (key === 'a' || key === 'arrowleft') keysPressed.a = false;
        if (key === 's' || key === 'arrowdown') keysPressed.s = false;
        if (key === 'd' || key === 'arrowright') keysPressed.d = false;
    });

    gameContainer.addEventListener('click', (event) => {
        if (!gameActive) return;
        // Ensure player base is valid before firing
        if (playerBaseIndex < 0 || playerBaseIndex >= bases.length || !bases[playerBaseIndex]?.isActive) {
            return;
        }
        const rect = gameContainer.getBoundingClientRect();
        const targetX = event.clientX - rect.left;
        const targetY = event.clientY - rect.top;
        fireBlob(playerBaseIndex, targetX, targetY);
    });
}

// =============================================================================
// --- Initial Game Start ---
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded. Starting game initialization.");
    initGame(); // Initialize the game state
    if (gameActive) {
        requestAnimationFrame(gameLoop); // Start the game loop if initialization was successful
    } else {
        console.error("Game initialization failed. Game loop not started.");
        // Optionally display an error message to the user here
    }
});
