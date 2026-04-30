
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d', { alpha: false });

        // --- AUDIO ENGINE (Synthesized) ---
        let audioCtx;
        function initAudio() {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }

        function playSound(type) {
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            const now = audioCtx.currentTime;
            
            if (type === 'bounce') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
                gainNode.gain.setValueAtTime(0.3, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (type === 'break') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
                gainNode.gain.setValueAtTime(0.3, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
            } else if (type === 'powerup') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.linearRampToValueAtTime(800, now + 0.1);
                osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
                gainNode.gain.setValueAtTime(0.4, now);
                gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            } else if (type === 'die') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.4);
                gainNode.gain.setValueAtTime(0.5, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
            }
        }

        // --- RESPONSIVE LOGICAL RESOLUTION ---
        const LOGICAL_WIDTH = 1080;
        const LOGICAL_HEIGHT = 1920;
        let scale = 1, offsetX = 0, offsetY = 0;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            scale = Math.min(canvas.width / LOGICAL_WIDTH, canvas.height / LOGICAL_HEIGHT);
            offsetX = (canvas.width - LOGICAL_WIDTH * scale) / 2;
            offsetY = (canvas.height - LOGICAL_HEIGHT * scale) / 2;
        }
        window.addEventListener('resize', resize);
        resize();

        function screenToLogical(screenX, screenY) {
            return { x: (screenX - offsetX) / scale, y: (screenY - offsetY) / scale };
        }

        // --- GAME STATE & ENTITIES ---
        let state = 'MENU';
        let score = 0, lives = 3, level = 1, frameCount = 0;
        let shakeAmount = 0;
        
        const input = { x: LOGICAL_WIDTH / 2, y: LOGICAL_HEIGHT / 2, isDown: false, tapped: false };
        const colors = ['#FF0055', '#00FF99', '#00DDFF', '#FFD700', '#BF00FF', '#FF5500'];

        let paddle = { x: LOGICAL_WIDTH / 2, y: LOGICAL_HEIGHT - 250, width: 200, height: 35, color: '#00FF99', targetX: LOGICAL_WIDTH / 2 };
        let balls = [];
        let blocks = [];
        let particles = [];
        let floatingTexts = [];
        let powerups = [];
        let stars = Array.from({length: 100}, () => ({
            x: Math.random() * LOGICAL_WIDTH, y: Math.random() * LOGICAL_HEIGHT,
            size: Math.random() * 3 + 1, speed: Math.random() * 2 + 0.5
        }));

        function addShake(amount) { shakeAmount = Math.min(shakeAmount + amount, 30); }

        function createBall(x, y, vx, vy) {
            return { x, y, radius: 18, vx, vy, speed: Math.sqrt(vx*vx + vy*vy), baseSpeed: 16, color: '#00DDFF', trail: [], active: true };
        }

        function resetRound() {
            paddle.width = 200;
            balls = [{
                x: paddle.x, y: paddle.y - 40, radius: 18, vx: (Math.random() > 0.5 ? 1 : -1) * 10, vy: -12, speed: 16, baseSpeed: 16, color: '#00DDFF', trail: [], active: false
            }];
            powerups = [];
        }

        function generateLevel(lvl) {
            blocks = [];
            const rows = Math.min(4 + Math.floor(lvl / 2), 10);
            const cols = 7;
            const bWidth = 125, bHeight = 55, padding = 15;
            const startX = (LOGICAL_WIDTH - (cols * (bWidth + padding) - padding)) / 2;
            const startY = 200;

            let pattern = lvl % 4; // Different layouts

            for (let r = 0; r < rows; r++) {
                const color = colors[r % colors.length];
                for (let c = 0; c < cols; c++) {
                    // Create patterns (skipping some blocks)
                    if (pattern === 1 && (r+c) % 2 === 0) continue; 
                    if (pattern === 2 && r > 2 && (c === 0 || c === cols-1)) continue;
                    if (pattern === 3 && c === Math.floor(cols/2)) continue;

                    let hp = (r < 2 && lvl > 2) ? 2 : 1; // Top rows sometimes need 2 hits

                    blocks.push({
                        x: startX + c * (bWidth + padding),
                        y: startY + r * (bHeight + padding),
                        width: bWidth, height: bHeight, color: color, hp: hp, maxHp: hp, active: true,
                        points: hp * 10
                    });
                }
            }
        }

        // --- INPUT HANDLING ---
        function handleInputStart(e) {
            initAudio(); // Required for browsers to allow sound
            input.isDown = true; input.tapped = true; updateInputPos(e);
        }
        function handleInputMove(e) { if (input.isDown) updateInputPos(e); }
        function handleInputEnd(e) { input.isDown = false; }
        function updateInputPos(e) {
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } 
            else { clientX = e.clientX; clientY = e.clientY; }
            const logicalPos = screenToLogical(clientX, clientY);
            input.x = logicalPos.x; input.y = logicalPos.y;
        }

        canvas.addEventListener('mousedown', handleInputStart);
        window.addEventListener('mousemove', handleInputMove);
        window.addEventListener('mouseup', handleInputEnd);
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleInputStart(e); }, { passive: false });
        window.addEventListener('touchmove', (e) => { e.preventDefault(); handleInputMove(e); }, { passive: false });
        window.addEventListener('touchend', handleInputEnd);

        // --- EFFECTS ---
        function spawnParticles(x, y, color, count=20) {
            for (let i = 0; i < count; i++) {
                let angle = Math.random() * Math.PI * 2;
                let speed = Math.random() * 10 + 5;
                particles.push({
                    x: x, y: y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
                    life: 1, decay: Math.random() * 0.03 + 0.015, color: color, size: Math.random() * 12 + 4
                });
            }
        }
        function spawnText(x, y, text, color) { floatingTexts.push({ x, y, text, color, life: 1, vy: -3 }); }
        
        function spawnPowerup(x, y) {
            if(Math.random() > 0.15) return; // 15% drop rate
            const types = [
                { type: 'M', color: '#00DDFF', name: 'MULTIBALL' },
                { type: 'W', color: '#00FF99', name: 'WIDER' }
            ];
            const p = types[Math.floor(Math.random() * types.length)];
            powerups.push({ x, y, radius: 25, vy: 5, ...p });
        }

        // --- MAIN LOGIC ---
        function update() {
            frameCount++;
            
            // Update Background Stars
            stars.forEach(s => {
                s.y += s.speed * (state === 'PLAYING' ? 2 : 0.5);
                if (s.y > LOGICAL_HEIGHT) { s.y = 0; s.x = Math.random() * LOGICAL_WIDTH; }
            });

            if (state === 'MENU' || state === 'GAMEOVER') {
                if (input.tapped) {
                    score = 0; lives = 3; level = 1;
                    generateLevel(level);
                    resetRound();
                    state = 'PLAYING';
                    playSound('powerup');
                    input.tapped = false;
                }
                return;
            }

            // --- PLAYING STATE ---
            
            // Paddle Movement
            paddle.targetX = input.x;
            paddle.targetX = Math.max(paddle.width / 2 + 10, Math.min(LOGICAL_WIDTH - paddle.width / 2 - 10, paddle.targetX));
            paddle.x += (paddle.targetX - paddle.x) * 0.3; // Smooth follow

            // Update Powerups
            for (let i = powerups.length - 1; i >= 0; i--) {
                let p = powerups[i];
                p.y += p.vy;
                // Check catch
                if (p.y + p.radius >= paddle.y && p.y - p.radius <= paddle.y + paddle.height && 
                    p.x >= paddle.x - paddle.width/2 && p.x <= paddle.x + paddle.width/2) {
                    playSound('powerup');
                    spawnText(p.x, paddle.y - 40, p.name, p.color);
                    if (p.type === 'W') paddle.width = Math.min(paddle.width + 60, 400);
                    if (p.type === 'M') {
                        let activeBalls = balls.filter(b => b.active);
                        activeBalls.forEach(b => {
                            balls.push(createBall(b.x, b.y, b.vx * -0.8, b.vy * 0.9));
                            balls.push(createBall(b.x, b.y, b.vx * 0.8, b.vy * 1.1));
                        });
                    }
                    powerups.splice(i, 1);
                } else if (p.y > LOGICAL_HEIGHT) {
                    powerups.splice(i, 1);
                }
            }

            // Update Balls
            let allDead = true;
            for (let i = balls.length - 1; i >= 0; i--) {
                let b = balls[i];
                
                if (!b.active) {
                    b.x = paddle.x;
                    b.y = paddle.y - b.radius - 5;
                    allDead = false;
                    if (input.isDown) b.active = true;
                    continue;
                }

                allDead = false;
                
                // Trail logic
                b.trail.push({ x: b.x, y: b.y });
                if (b.trail.length > 10) b.trail.shift();

                b.x += b.vx;
                b.y += b.vy;

                // Wall Collisions
                if (b.x - b.radius < 0) { b.x = b.radius; b.vx *= -1; playSound('bounce'); addShake(2); }
                if (b.x + b.radius > LOGICAL_WIDTH) { b.x = LOGICAL_WIDTH - b.radius; b.vx *= -1; playSound('bounce'); addShake(2); }
                if (b.y - b.radius < 0) { b.y = b.radius; b.vy *= -1; playSound('bounce'); addShake(2); }
                
                // Anti-flatline (prevent ball bouncing horizontally forever)
                if (Math.abs(b.vy) < 4) b.vy = b.vy > 0 ? 4 : -4;

                // Death Zone
                if (b.y - b.radius > LOGICAL_HEIGHT) {
                    spawnParticles(b.x, b.y - 20, '#FF0055', 30);
                    balls.splice(i, 1);
                    playSound('die');
                    addShake(15);
                    continue;
                }

                // Paddle Collision
                if (b.vy > 0 && b.y + b.radius >= paddle.y && b.y - b.radius <= paddle.y + paddle.height) {
                    if (b.x > paddle.x - paddle.width/2 - b.radius && b.x < paddle.x + paddle.width/2 + b.radius) {
                        b.y = paddle.y - b.radius;
                        let hitRatio = (b.x - paddle.x) / (paddle.width / 2);
                        hitRatio = Math.max(-1, Math.min(1, hitRatio)); // clamp
                        let angle = hitRatio * (Math.PI / 2.5); // wider angle
                        
                        b.vx = b.speed * Math.sin(angle);
                        b.vy = -b.speed * Math.cos(angle);
                        spawnParticles(b.x, b.y, paddle.color, 10);
                        playSound('bounce');
                        addShake(3);
                    }
                }

                // Block Collisions
                for (let j = 0; j < blocks.length; j++) {
                    let bl = blocks[j];
                    if (!bl.active) continue;

                    let closestX = Math.max(bl.x, Math.min(b.x, bl.x + bl.width));
                    let closestY = Math.max(bl.y, Math.min(b.y, bl.y + bl.height));
                    
                    let dx = b.x - closestX;
                    let dy = b.y - closestY;

                    if ((dx * dx) + (dy * dy) < (b.radius * b.radius)) {
                        bl.hp--;
                        playSound('break');
                        addShake(5);
                        
                        if (bl.hp <= 0) {
                            bl.active = false;
                            score += bl.points;
                            spawnParticles(closestX, closestY, bl.color, 25);
                            spawnText(bl.x + bl.width/2, bl.y, `+${bl.points}`, bl.color);
                            spawnPowerup(bl.x + bl.width/2, bl.y);
                            
                            // Speed up slightly based on baseSpeed
                            b.speed = Math.min(b.speed + 0.2, b.baseSpeed * 1.8);
                        } else {
                            bl.color = '#FFFFFF'; // Flash white if not dead
                            setTimeout(()=> { if(bl.active) bl.color = colors[j % colors.length]; }, 100);
                        }
                        
                        // Bounce logic
                        if (Math.abs(dx) > Math.abs(dy)) b.vx *= -1;
                        else b.vy *= -1;
                        break; // Only hit one block per frame per ball
                    }
                }
            }

            if (allDead) {
                lives--;
                if (lives <= 0) {
                    state = 'GAMEOVER';
                } else {
                    resetRound();
                }
            }

            // Level Complete Check
            if (blocks.every(b => !b.active) && frameCount > 60) {
                level++;
                resetRound();
                generateLevel(level);
                spawnText(LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2, `LEVEL ${level} COMPLETE!`, '#FFFFFF');
                playSound('powerup');
            }

            // Effects Updates
            particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= p.decay; });
            particles = particles.filter(p => p.life > 0);
            
            floatingTexts.forEach(ft => { ft.y += ft.vy; ft.life -= 0.02; });
            floatingTexts = floatingTexts.filter(ft => ft.life > 0);
            
            if (shakeAmount > 0) shakeAmount *= 0.85; // Dampen shake
            if (shakeAmount < 0.5) shakeAmount = 0;

            input.tapped = false;
        }

        // --- RENDERING ---
        function roundRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius); ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height); ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius); ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath(); ctx.fill();
        }

        function draw() {
            ctx.fillStyle = '#030308';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.scale(scale, scale);

            // Apply Screen Shake
            if (shakeAmount > 0) {
                const sx = (Math.random() - 0.5) * shakeAmount;
                const sy = (Math.random() - 0.5) * shakeAmount;
                ctx.translate(sx, sy);
            }

            // Draw Stars
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            stars.forEach(s => {
                ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI*2); ctx.fill();
            });

            // Draw Boundary
            ctx.strokeStyle = '#1a1a3a'; ctx.lineWidth = 6;
            ctx.strokeRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

            if (state === 'PLAYING' || state === 'GAMEOVER') {
                // Blocks
                blocks.forEach(b => {
                    if (b.active) {
                        ctx.fillStyle = b.color;
                        ctx.shadowBlur = b.hp === b.maxHp ? 20 : 10;
                        ctx.shadowColor = b.color;
                        roundRect(ctx, b.x, b.y, b.width, b.height, 12);
                        
                        // Inner reflection
                        ctx.fillStyle = 'rgba(255,255,255,0.2)';
                        ctx.shadowBlur = 0;
                        roundRect(ctx, b.x + 5, b.y + 5, b.width - 10, b.height/2.5, 6);
                    }
                });

                // Powerups
                powerups.forEach(p => {
                    ctx.fillStyle = p.color;
                    ctx.shadowBlur = 15; ctx.shadowColor = p.color;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
                    ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(p.type, p.x, p.y);
                });

                // Particles
                particles.forEach(p => {
                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = p.life > 0.7 ? '#FFF' : p.color; // Hot spark effect
                    ctx.shadowBlur = 10; ctx.shadowColor = p.color;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
                });
                ctx.globalAlpha = 1.0; ctx.shadowBlur = 0;

                // Paddle
                ctx.fillStyle = paddle.color;
                ctx.shadowBlur = 25; ctx.shadowColor = paddle.color;
                roundRect(ctx, paddle.x - paddle.width/2, paddle.y, paddle.width, paddle.height, 17);
                ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.shadowBlur = 0;
                roundRect(ctx, paddle.x - paddle.width/2 + 10, paddle.y + 5, paddle.width - 20, paddle.height/2.5, 8);

                // Balls
                balls.forEach(b => {
                    if (b.active) {
                        ctx.globalAlpha = 0.4;
                        b.trail.forEach((t, i) => {
                            let r = b.radius * (i / b.trail.length);
                            ctx.fillStyle = b.color;
                            ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI*2); ctx.fill();
                        });
                        ctx.globalAlpha = 1.0;
                    }
                    ctx.fillStyle = '#FFF'; // Core is white
                    ctx.shadowBlur = 25; ctx.shadowColor = b.color;
                    ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
                });

                // HUD
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.font = 'bold 45px "Courier New"';
                ctx.textBaseline = 'alphabetic';
                ctx.textAlign = 'left'; ctx.fillText(`SCORE: ${score}`, 40, 80);
                ctx.textAlign = 'right'; ctx.fillText(`LIVES: ${lives}`, LOGICAL_WIDTH - 40, 80);
                ctx.textAlign = 'center'; ctx.fillText(`LEVEL ${level}`, LOGICAL_WIDTH / 2, 80);

                if (balls.length > 0 && !balls[0].active && state === 'PLAYING') {
                    ctx.fillStyle = `rgba(0, 255, 153, ${Math.abs(Math.sin(frameCount * 0.05))})`;
                    ctx.font = 'bold 50px "Courier New"';
                    ctx.fillText('TAP OR CLICK TO LAUNCH', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 150);
                }

                // Floating Texts
                floatingTexts.forEach(ft => {
                    ctx.globalAlpha = Math.max(0, ft.life);
                    ctx.fillStyle = ft.color;
                    ctx.shadowBlur = 10; ctx.shadowColor = ft.color;
                    ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center';
                    ctx.fillText(ft.text, ft.x, ft.y);
                });
                ctx.globalAlpha = 1.0; ctx.shadowBlur = 0;
            }

            // UI Screens
            if (state === 'MENU' || state === 'GAMEOVER') {
                if (state === 'GAMEOVER') {
                    ctx.fillStyle = 'rgba(0,0,0,0.85)';
                    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
                }

                const titleColor = state === 'MENU' ? '#00FF99' : '#FF0055';
                const subColor = state === 'MENU' ? '#00DDFF' : '#FFFFFF';
                const titleText = state === 'MENU' ? 'NEON' : 'GAME OVER';
                const subText = state === 'MENU' ? 'BREAKOUT' : `FINAL SCORE: ${score}`;

                ctx.fillStyle = titleColor; ctx.shadowBlur = 40; ctx.shadowColor = titleColor;
                ctx.font = 'bold 140px Arial'; ctx.textAlign = 'center';
                ctx.fillText(titleText, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 200);
                
                ctx.fillStyle = subColor; ctx.shadowColor = subColor;
                ctx.font = state === 'MENU' ? 'bold 100px Arial' : 'bold 70px Arial';
                ctx.fillText(subText, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 50);
                ctx.shadowBlur = 0;

                let pulse = Math.sin(frameCount * 0.08) * 15;
                ctx.fillStyle = state === 'MENU' ? '#FF0055' : '#00DDFF';
                ctx.shadowBlur = 30; ctx.shadowColor = ctx.fillStyle;
                roundRect(ctx, LOGICAL_WIDTH/2 - 250 - pulse/2, LOGICAL_HEIGHT/2 + 200 - pulse/2, 500 + pulse, 140 + pulse, 70);
                ctx.shadowBlur = 0;
                
                ctx.fillStyle = 'white';
                ctx.font = 'bold 55px Arial'; ctx.textBaseline = 'middle';
                ctx.fillText(state === 'MENU' ? 'START GAME' : 'PLAY AGAIN', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 270);
            }

            ctx.restore();
        }

        // --- GAME LOOP ---
        function loop() {
            update();
            draw();
            requestAnimationFrame(loop);
        }
        
        requestAnimationFrame(loop);
    
