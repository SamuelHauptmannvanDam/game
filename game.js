const gameContainer = document.getElementById('game-container');
const ui = document.getElementById('ui');
const victoryScreen = document.getElementById('victory');
const restartButton = document.getElementById('restart-button');
const touchControlMove = document.getElementById('touch-control-move'); // Get visual elements
const touchControlShoot = document.getElementById('touch-control-shoot'); // Get visual elements

// Game parameters
const NUM_BASES = 20;
const BASE_HEALTH = 30;
const BLOB_RADIUS = 8;
const BASE_RADIUS = 20;
const ATTACK_INTERVAL_MIN = 1000;
const ATTACK_INTERVAL_MAX = 3000;
const PLAYER_MOVE_SPEED = 2;
const BLOB_DAMAGE = 10;

// Game state
let bases = [];
let blobs = [];
let gameActive = true;
let playerBaseIndex = 0;
let teamCounts = {};
let lastAttackTimes = [];

// --- State for player movement keys ---
const keysPressed = { w: false, a: false, s: false, d: false };

// --- State for Touch Controls ---
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
console.log("Is Touch Device:", isTouchDevice);
let movementTouchId = null;
let touchDx = 0;
let touchDy = 0;

// --- Touch Control Configuration ---
const TOUCH_CIRCLE_RADIUS = 40; // Visual radius (matches CSS width/height / 2)
const TOUCH_ACTIVE_RADIUS = 60; // Larger radius for activation/detection
const TOUCH_CIRCLE_BOTTOM_MARGIN = 30; // Distance from bottom edge
let moveCircleCenter = { x: 0, y: 0 };
let shootCircleCenter = { x: 0, y: 0 };
// --------------------------------

// Define team colors
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

    keysPressed.w = false; keysPressed.a = false; keysPressed.s = false; keysPressed.d = false;
    movementTouchId = null; touchDx = 0; touchDy = 0;

    document.querySelectorAll('.base, .blob, .explosion').forEach(el => el.remove());

    // Calculate touch control positions *after* initial setup
    setupTouchControls(); // Call this before creating bases if bases depend on screen size

    createEvenlyDistributedBases();
    assignPlayerBase();

    updateTeamCountsDisplay();
    victoryScreen.style.display = "none";
}

// --- Function to Calculate and Position Touch Controls ---
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
    moveCircleCenter.y = screenHeight - TOUCH_CIRCLE_BOTTOM_MARGIN - TOUCH_CIRCLE_RADIUS;
    shootCircleCenter.y = screenHeight - TOUCH_CIRCLE_BOTTOM_MARGIN - TOUCH_CIRCLE_RADIUS;

    // Update visual element positions (top-left corner)
    touchControlMove.style.left = `${moveCircleCenter.x - TOUCH_CIRCLE_RADIUS}px`;
    touchControlMove.style.top = `${moveCircleCenter.y - TOUCH_CIRCLE_RADIUS}px`;
    touchControlMove.style.display = 'block'; // Make visible

    touchControlShoot.style.left = `${shootCircleCenter.x - TOUCH_CIRCLE_RADIUS}px`;
    touchControlShoot.style.top = `${shootCircleCenter.y - TOUCH_CIRCLE_RADIUS}px`;
    touchControlShoot.style.display = 'block'; // Make visible

    console.log("Touch controls positioned:", moveCircleCenter, shootCircleCenter);
}
// ------------------------------------------------------

function assignPlayerBase() {
    // ... (assignPlayerBase function remains the same)
    if (bases[playerBaseIndex] && bases[playerBaseIndex].element) {
        bases[playerBaseIndex].element.classList.add('player-base');
    } else {
        console.error(`Initial player base index ${playerBaseIndex} invalid or element missing.`);
        const firstActiveBaseIndex = bases.findIndex(b => b && b.isActive && b.element);
        if (firstActiveBaseIndex !== -1) {
            playerBaseIndex = firstActiveBaseIndex;
            bases[playerBaseIndex].element.classList.add('player-base');
            console.log(`Reassigned player base to first active base: Index ${playerBaseIndex}`);
        } else {
            console.error("Could not find any active base to assign to player.");
            gameActive = false;
        }
    }
}

function createEvenlyDistributedBases() {
    // ... (createEvenlyDistributedBases function remains the same)
    const width = window.innerWidth;
    const height = window.innerHeight;
    const margin = 100;
    const usableWidth = width - 2 * margin;
    // Adjust usable height slightly to avoid overlap with bottom controls maybe?
    const usableHeight = height - 2 * margin - (TOUCH_CIRCLE_BOTTOM_MARGIN + TOUCH_CIRCLE_RADIUS * 2);
    const gridSize = Math.ceil(Math.sqrt(NUM_BASES));
    const cellWidth = usableWidth / gridSize;
    const cellHeight = usableHeight / Math.max(1, gridSize); // Avoid division by zero if gridSize is 0
    const positions = [];

    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            if (positions.length >= NUM_BASES) break;
            // Start placing from the top margin
            const baseY = margin;
            const centerX = margin + col * cellWidth + cellWidth / 2;
            const centerY = baseY + row * cellHeight + cellHeight / 2;
            const randomOffsetX = (Math.random() - 0.5) * 0.6 * cellWidth;
            const randomOffsetY = (Math.random() - 0.5) * 0.6 * cellHeight;
            positions.push({
                x: centerX + randomOffsetX,
                y: centerY + randomOffsetY
            });
        }
        if (positions.length >= NUM_BASES) break;
    }

    for (let i = 0; i < NUM_BASES; i++) {
        const position = positions[i];
        const color = teamColors[i % teamColors.length];
        createBase(position.x, position.y, i, color);
        lastAttackTimes[i] = Date.now();
        if (!teamCounts[color]) { teamCounts[color] = 0; }
        teamCounts[color]++;
    }
}

function createBase(x, y, id, color) {
    // ... (createBase function remains the same)
    const base = document.createElement('div');
    base.className = 'base';
    base.style.left = `${x - BASE_RADIUS}px`;
    base.style.top = `${y - BASE_RADIUS}px`;
    base.style.backgroundColor = color;
    base.textContent = BASE_HEALTH;
    base.dataset.id = id;
    gameContainer.appendChild(base);
    bases.push({ element: base, x: x, y: y, id: id, health: BASE_HEALTH, color: color, radius: BASE_RADIUS, isActive: true });
}

function createBlob(originX, originY, targetX, targetY, originColor, originId, targetId) {
    // ... (createBlob function remains the same)
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
    blobs.push({ element: blob, x: originX, y: originY, vx: vx, vy: vy, color: originColor, originId: originId, targetId: targetId, radius: BLOB_RADIUS });
}

function fireBlob(originBaseIndex, targetX, targetY) {
    // ... (fireBlob function remains the same)
    if (originBaseIndex < 0 || originBaseIndex >= bases.length) { console.warn("Invalid origin index:", originBaseIndex); return; }
    const originBase = bases[originBaseIndex];
    if (!originBase || !originBase.isActive) { console.warn("Inactive origin base:", originBaseIndex); return; }
    const angle = Math.atan2(targetY - originBase.y, targetX - originBase.x);
    const startDist = originBase.radius + BLOB_RADIUS + 1;
    const startX = originBase.x + Math.cos(angle) * startDist;
    const startY = originBase.y + Math.sin(angle) * startDist;
    createBlob(startX, startY, targetX, targetY, originBase.color, originBase.id, null);
    if (lastAttackTimes[originBaseIndex] !== undefined) { lastAttackTimes[originBaseIndex] = Date.now(); }
}

function handlePlayerMovement() {
    // ... (handlePlayerMovement function remains the same, using touchDx/touchDy or keysPressed)
    if (playerBaseIndex < 0 || playerBaseIndex >= bases.length) return;
    const playerBase = bases[playerBaseIndex];
    if (!playerBase || !playerBase.isActive || !playerBase.element) return;

    let dx = 0; let dy = 0;

    if (isTouchDevice && movementTouchId !== null) {
        dx = touchDx; dy = touchDy;
    } else if (!isTouchDevice) {
        if (keysPressed.w) dy -= 1; if (keysPressed.s) dy += 1;
        if (keysPressed.a) dx -= 1; if (keysPressed.d) dx += 1;
    }

    if (dx !== 0 || dy !== 0) {
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        let moveX = 0; let moveY = 0;
        if (magnitude > 0) {
            moveX = (dx / magnitude) * PLAYER_MOVE_SPEED;
            moveY = (dy / magnitude) * PLAYER_MOVE_SPEED;
        }
        playerBase.x += moveX; playerBase.y += moveY;
        const minX = playerBase.radius; const maxX = window.innerWidth - playerBase.radius;
        const minY = playerBase.radius; const maxY = window.innerHeight - playerBase.radius;
        playerBase.x = Math.max(minX, Math.min(maxX, playerBase.x));
        playerBase.y = Math.max(minY, Math.min(maxY, playerBase.y));
        playerBase.element.style.left = `${playerBase.x - playerBase.radius}px`;
        playerBase.element.style.top = `${playerBase.y - playerBase.radius}px`;
    }
}

function updateBlobPositions() {
    // ... (updateBlobPositions function remains the same)
    for (let i = blobs.length - 1; i >= 0; i--) {
        const blob = blobs[i];
        if (!blob) { blobs.splice(i, 1); continue; }
        if (!blob.element || !document.body.contains(blob.element)) { blobs.splice(i, 1); continue; }

        blob.x += blob.vx; blob.y += blob.vy;
        blob.element.style.left = `${blob.x - blob.radius}px`;
        blob.element.style.top = `${blob.y - blob.radius}px`;

        let blobRemoved = false;
        for (let j = 0; j < bases.length; j++) {
            const base = bases[j];
            if (!base || !base.isActive) continue;
            const distance = Math.sqrt(Math.pow(blob.x - base.x, 2) + Math.pow(blob.y - base.y, 2));
            if (distance < blob.radius + base.radius) {
                handleBlobBaseCollision(blob, base, i);
                blobRemoved = true; break;
            }
        }
        if (blobRemoved) continue;

        const currentBlob = blobs[i];
        if (currentBlob && currentBlob.element) {
            for (let j = blobs.length - 1; j >= 0; j--) {
                if (i === j || i >= blobs.length || j >= blobs.length) continue;
                const otherBlob = blobs[j];
                if (!otherBlob || !otherBlob.element) continue;
                const distance = Math.sqrt(Math.pow(currentBlob.x - otherBlob.x, 2) + Math.pow(currentBlob.y - otherBlob.y, 2));
                if (distance < currentBlob.radius + otherBlob.radius && currentBlob.color !== otherBlob.color) {
                    createExplosion((currentBlob.x + otherBlob.x) / 2, (currentBlob.y + otherBlob.y) / 2);
                    if (currentBlob.element) currentBlob.element.remove();
                    if (otherBlob.element) otherBlob.element.remove();
                    const indexToRemoveFirst = Math.max(i, j);
                    const indexToRemoveSecond = Math.min(i, j);
                    blobs.splice(indexToRemoveFirst, 1);
                    if (indexToRemoveSecond < blobs.length) { blobs.splice(indexToRemoveSecond, 1); }
                    blobRemoved = true; break;
                }
            }
        }
        if (blobRemoved) continue;

        const finalCheckBlob = blobs[i];
        if (finalCheckBlob && finalCheckBlob.element && (
            finalCheckBlob.x < -finalCheckBlob.radius * 2 || finalCheckBlob.x > window.innerWidth + finalCheckBlob.radius * 2 ||
            finalCheckBlob.y < -finalCheckBlob.radius * 2 || finalCheckBlob.y > window.innerHeight + finalCheckBlob.radius * 2)) {
            finalCheckBlob.element.remove();
            blobs.splice(i, 1);
        }
    }
}

function handleBlobBaseCollision(blob, base, blobIndex) {
    // ... (handleBlobBaseCollision function remains the same)
    if (!blob || !base || !base.isActive) {
        if (blob && blob.element) blob.element.remove();
        if (blobIndex < blobs.length && blobs[blobIndex] === blob) { blobs.splice(blobIndex, 1); }
        return;
    }
    if (blob.color === base.color) {
        if (blob.element) blob.element.remove();
        if (blobIndex < blobs.length && blobs[blobIndex] === blob) { blobs.splice(blobIndex, 1); }
        return;
    }
    base.health -= BLOB_DAMAGE;
    if (base.element) { base.element.textContent = Math.max(0, base.health); }
    createExplosion(blob.x, blob.y);
    const originBaseId = blob.originId;
    if (blob.element) blob.element.remove();
    if (blobIndex < blobs.length && blobs[blobIndex] === blob) { blobs.splice(blobIndex, 1); }
    if (base.health <= 0) { captureBase(base, blob.color, originBaseId); }
}

function captureBase(base, newColor) { // Removed unused captorOriginId parameter
    if (!base || !base.isActive || !base.element) return;

    // Decrement count for the old color
    if (teamCounts[base.color] && teamCounts[base.color] > 0) {
        teamCounts[base.color]--;
    }

    const oldColor = base.color;
    // Store the current player's base ID *before* potentially changing anything
    const oldPlayerBaseId = (playerBaseIndex >= 0 && playerBaseIndex < bases.length && bases[playerBaseIndex]) ? bases[playerBaseIndex].id : -1;

    // Update the base's properties
    base.color = newColor;
    base.element.style.backgroundColor = newColor;
    base.health = BASE_HEALTH;
    base.element.textContent = base.health;

    // Increment count for the new color
    if (!teamCounts[newColor]) { teamCounts[newColor] = 0; }
    teamCounts[newColor]++;

    // Check if the captured base *was* the player's base
    if (base.id === oldPlayerBaseId) {
        // Player's base was captured. Player continues controlling this base.
        // playerBaseIndex remains unchanged.
        // 'player-base' class remains on base.element.
        console.log(`Player base captured! Player continues controlling base ID ${base.id} (Index ${playerBaseIndex}) for new color ${newColor}.`);
    }

    // Update UI and check for game end
    updateTeamCountsDisplay();
    checkVictoryCondition();
}



function createExplosion(x, y) {
    // ... (createExplosion function remains the same)
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    const explosionSize = 30;
    explosion.style.left = `${x - explosionSize / 2}px`;
    explosion.style.top = `${y - explosionSize / 2}px`;
    explosion.style.width = `${explosionSize}px`;
    explosion.style.height = `${explosionSize}px`;
    gameContainer.appendChild(explosion);
    setTimeout(() => { explosion.remove(); }, 500);
}

function botAttack() {
    // ... (botAttack function remains the same)
    const now = Date.now();
    for (let i = 0; i < bases.length; i++) {
        if (i === playerBaseIndex) continue;
        const base = bases[i];
        if (!base || !base.isActive || now - lastAttackTimes[i] < getRandomAttackInterval()) { continue; }
        const potentialTargets = bases.filter(target => target && target.isActive && target.color !== base.color);
        if (potentialTargets.length > 0) {
            const targetBase = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
            fireBlob(i, targetBase.x, targetBase.y);
            lastAttackTimes[i] = now;
        }
    }
}

function getRandomAttackInterval() {
    // ... (getRandomAttackInterval function remains the same)
    return ATTACK_INTERVAL_MIN + Math.random() * (ATTACK_INTERVAL_MAX - ATTACK_INTERVAL_MIN);
}

function updateTeamCountsDisplay() {
    // ... (updateTeamCountsDisplay function remains the same)
    ui.innerHTML = '';
    const title = document.createElement('div'); title.textContent = "Teams:"; title.style.marginBottom = "10px"; title.style.fontWeight = "bold"; ui.appendChild(title);
    const playerBase = (playerBaseIndex >= 0 && playerBaseIndex < bases.length) ? bases[playerBaseIndex] : null;
    const playerColor = (playerBase && playerBase.isActive) ? playerBase.color : null;
    const sortedColors = Object.keys(teamCounts).sort();
    for (const color of sortedColors) {
        if (teamCounts[color] > 0) {
            const teamCount = document.createElement('div'); teamCount.className = 'team-count';
            teamCount.innerHTML = `<span style="display: inline-block; width: 12px; height: 12px; background-color: ${color}; margin-right: 5px; vertical-align: middle; border: 1px solid #555;"></span> ${teamCounts[color]} bases`;
            if (playerColor && color === playerColor) { teamCount.style.fontWeight = "bold"; teamCount.innerHTML += " (You)"; }
            ui.appendChild(teamCount);
        }
    }
}

function checkVictoryCondition() {
    // ... (checkVictoryCondition function remains the same)
    const activeColors = new Set(); let activeBaseCount = 0;
    bases.forEach(base => { if (base && base.isActive) { activeColors.add(base.color); activeBaseCount++; } });
    if (activeColors.size <= 1) {
        gameActive = false;
        const playerBase = (playerBaseIndex >= 0 && playerBaseIndex < bases.length) ? bases[playerBaseIndex] : null;
        const playerIsActiveAndExists = playerBase && playerBase.isActive;
        if (activeColors.size === 1) {
            const winningColor = activeColors.values().next().value;
            if (playerIsActiveAndExists && playerBase.color === winningColor) {
                victoryScreen.querySelector('h2').textContent = "Victory!";
                victoryScreen.querySelector('p').textContent = `Your color (${playerBase.color}) conquered!`;
            } else {
                victoryScreen.querySelector('h2').textContent = "Defeat!";
                if (playerIsActiveAndExists) { victoryScreen.querySelector('p').textContent = `Color ${winningColor} conquered. You ended on team ${playerBase.color}.`; }
                else { victoryScreen.querySelector('p').textContent = `Color ${winningColor} conquered. Your base was destroyed.`; }
            }
            victoryScreen.style.display = "block";
        } else if (activeBaseCount === 0) {
            victoryScreen.querySelector('h2').textContent = "Draw!";
            victoryScreen.querySelector('p').textContent = "All bases destroyed.";
            victoryScreen.style.display = "block";
        }
    }
}

function gameLoop() {
    if (!gameActive) return;
    handlePlayerMovement();
    updateBlobPositions();
    botAttack();
    requestAnimationFrame(gameLoop);
}

restartButton.addEventListener('click', () => {
    victoryScreen.style.display = "none";
    initGame();
    if (gameActive) { requestAnimationFrame(gameLoop); }
});

// --- Input Event Listeners ---

if (isTouchDevice) {
    // --- Touch Event Handlers (NEW LOGIC) ---

    function handleTouchStart(event) {
        if (!gameActive) return;
        event.preventDefault(); // Prevent default actions like scrolling/zooming
        const screenWidth = window.innerWidth; // Get screen width for splitting

        for (let touch of event.changedTouches) {
            const touchX = touch.clientX;
            const touchY = touch.clientY;
            const touchId = touch.identifier;

            // --- Determine Intent: Left side for Move, Right side for Shoot ---

            // Check if touch is on the left half of the screen (for movement)
            if (touchX < screenWidth / 2) {
                // Only start a *new* movement touch if one isn't already active
                if (movementTouchId === null) {
                    movementTouchId = touchId;
                    // Calculate initial movement vector relative to the move circle's center
                    const deltaX = touchX - moveCircleCenter.x;
                    const deltaY = touchY - moveCircleCenter.y;
                    const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                    if (magnitude > 0) {
                        touchDx = deltaX / magnitude;
                        touchDy = deltaY / magnitude;
                    } else {
                        touchDx = 0; // No movement if touch is exactly at center
                        touchDy = 0;
                    }
                    // console.log("Movement touch started (Left Side):", touchId, "dx:", touchDx, "dy:", touchDy);
                }
            }
            // Else, touch is on the right half of the screen (for shooting)
            else {
                // Check if player has a valid base before shooting
                if (playerBaseIndex >= 0 && playerBaseIndex < bases.length && bases[playerBaseIndex] && bases[playerBaseIndex].isActive) {
                    const playerBase = bases[playerBaseIndex];

                    // Calculate direction RELATIVE TO THE SHOOT CIRCLE CENTER,
                    // regardless of how far the actual touch is from it.
                    const deltaX = touchX - shootCircleCenter.x;
                    const deltaY = touchY - shootCircleCenter.y;
                    const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                    let shootDirX = 0;
                    let shootDirY = 0;
                    // Ensure magnitude is not zero to avoid division by zero
                    if (magnitude > 0) {
                        shootDirX = deltaX / magnitude;
                        shootDirY = deltaY / magnitude;
                    } else {
                        // If tap is exactly on the shoot circle center, maybe default shoot upwards? Or skip?
                        // Let's skip shooting if the tap is exactly on the center.
                        console.log("Tap exactly on shoot center, skipping shot.");
                        continue; // Go to the next touch in the event
                    }

                    // Calculate a target point far away in that direction from the player base
                    const targetDist = 2000; // Arbitrarily large distance
                    const targetX = playerBase.x + shootDirX * targetDist;
                    const targetY = playerBase.y + shootDirY * targetDist;

                    // console.log("Shoot touch detected (Right Side). Firing towards:", targetX, targetY);
                    fireBlob(playerBaseIndex, targetX, targetY);
                } else {
                    // console.log("Player base inactive or invalid, cannot shoot via touch.");
                }
            }
        }
    }

    function handleTouchMove(event) {
        if (!gameActive || movementTouchId === null) return; // Only process if a movement touch is active
        event.preventDefault();

        for (let touch of event.changedTouches) {
            if (touch.identifier === movementTouchId) {
                // Update movement vector based on current position relative to MOVE circle's center
                const touchX = touch.clientX;
                const touchY = touch.clientY;
                const deltaX = touchX - moveCircleCenter.x;
                const deltaY = touchY - moveCircleCenter.y;
                const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                if (magnitude > 0) {
                    touchDx = deltaX / magnitude;
                    touchDy = deltaY / magnitude;
                } else {
                    touchDx = 0; // Stop if finger moves exactly to center
                    touchDy = 0;
                }
                // console.log("Movement touch moved:", touchId, "dx:", touchDx, "dy:", touchDy);
                break; // Found the movement touch, no need to check others in this event
            }
        }
    }

    function handleTouchEnd(event) {
        if (!gameActive) return;
        // No preventDefault needed usually for touchend

        for (let touch of event.changedTouches) {
            if (touch.identifier === movementTouchId) {
                // Stop movement when the controlling finger is lifted
                movementTouchId = null;
                touchDx = 0;
                touchDy = 0;
                // console.log("Movement touch ended:", touch.identifier);
                break; // Found the movement touch
            }
            // No specific action needed for ending a shooting touch as it's instant
        }
    }

    // Add touch listeners to the game container
    gameContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    gameContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    gameContainer.addEventListener('touchend', handleTouchEnd, { passive: false });
    gameContainer.addEventListener('touchcancel', handleTouchEnd, { passive: false }); // Treat cancel like end

    // Recalculate positions on resize
    window.addEventListener('resize', setupTouchControls);

} else {
    // --- Keyboard & Mouse Listeners (Only for non-touch devices) ---
    gameContainer.style.cursor = 'crosshair'; // Set cursor only for non-touch

    window.addEventListener('keydown', (event) => {
        if (!gameActive) return;
        const key = event.key.toLowerCase();
        if (key === 'w') keysPressed.w = true; if (key === 'a') keysPressed.a = true;
        if (key === 's') keysPressed.s = true; if (key === 'd') keysPressed.d = true;
    });

    window.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        if (key === 'w') keysPressed.w = false; if (key === 'a') keysPressed.a = false;
        if (key === 's') keysPressed.s = false; if (key === 'd') keysPressed.d = false;
    });

    gameContainer.addEventListener('click', (event) => {
        if (!gameActive) return;
        if (playerBaseIndex < 0 || playerBaseIndex >= bases.length || !bases[playerBaseIndex] || !bases[playerBaseIndex].isActive) { return; }
        const rect = gameContainer.getBoundingClientRect();
        const targetX = event.clientX - rect.left;
        const targetY = event.clientY - rect.top;
        fireBlob(playerBaseIndex, targetX, targetY);
    });
}

// --- Common Initialization ---
document.addEventListener('DOMContentLoaded', (event) => {
    initGame(); // This now calls setupTouchControls internally
    if (gameActive) {
        requestAnimationFrame(gameLoop);
    } else {
        console.error("Game initialization failed. Game loop not started.");
    }
});
