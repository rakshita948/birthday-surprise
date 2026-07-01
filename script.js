/**
 * Friendship Journey Scrapbook - Core Controller
 * Handles animations, audio synthesis, canvas scratch cards, Polaroid export, and configurator forms.
 */

// ==========================================
// 1. Initial State & Config Setup
// ==========================================
let config = window.scrapbookConfig;

// Load local overrides if user edited content in the Configurator Portal
const localOverride = localStorage.getItem('scrapbook_local_config');
if (localOverride) {
    try {
        config = JSON.parse(localOverride);
        // Sync back to window object
        window.scrapbookConfig = config;
    } catch (e) {
        console.error("Error loading local config override, falling back.", e);
    }
}

let unlockedChapters = [1];
let openedReasons = new Set();
let openedLetters = new Set();
let blownCandles = new Set();
let viewedPolaroids = new Set();
let scratchOpened = false;

// ==========================================
// 2. Initializers
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Hide loader after 3 seconds
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader) loader.classList.add('fade-out');
    }, 3000);

    // Initial setup
    updateFriendshipCounter();
    setInterval(updateFriendshipCounter, 1000 * 60 * 60 * 24); // Update daily

    initTheme();
    setupMusicUI();
    initParticles();
    
    // Render dynamic elements
    renderGuessWho();
    renderPolaroids();
    renderQuizQuestion();
    renderReasons();
    renderEnvelopes();
    setupCandles();
    setupEasterEggs();
    setupConfigurator();

    // Start background particle canvas ticking
    requestAnimationFrame(animate);
});

// ==========================================
// 3. Friendship Date Calculator
// ==========================================
function updateFriendshipCounter() {
    const startDateStr = config.friendshipStartDate || "2024-08-06";
    const start = new Date(startDateStr);
    const now = new Date();
    
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();
    
    if (days < 0) {
        months--;
        // Days in previous month
        const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += prevMonth.getDate();
    }
    if (months < 0) {
        years--;
        months += 12;
    }
    
    const counterElement = document.getElementById('friendship-counter');
    if (counterElement) {
        counterElement.textContent = `${years} years, ${months} months, ${days} days`;
    }
}

// ==========================================
// 4. Ambient Synthesizer (Web Audio API)
// ==========================================
class DreamSynth {
    constructor() {
        this.ctx = null;
        this.isPlaying = false;
        this.gainNode = null;
        this.filterNode = null;
        this.delayNode = null;
        this.feedbackNode = null;
        this.intervalId = null;
        
        // Dreamy Chords (Frequencies): Cmaj7, Am9, Fmaj7, G11
        this.chords = [
            [130.81, 196.00, 246.94, 329.63, 523.25], // C3, G3, B3, E4, C5
            [110.00, 196.00, 261.63, 329.63, 493.88], // A2, G3, C4, E4, B4
            [87.31,  174.61, 220.00, 261.63, 329.63], // F2, F3, A3, C4, E4
            [98.00,  174.61, 246.94, 293.66, 440.00]  // G2, F3, B3, D4, A4
        ];
        
        // Pentatonic Bell notes per chord for arpeggiation
        this.melody = [
            [523.25, 587.33, 659.25, 783.99], // C5, D5, E5, G5
            [493.88, 523.25, 587.33, 659.25], // B4, C5, D5, E5
            [440.00, 523.25, 587.33, 698.46], // A4, C5, D5, F5
            [392.00, 440.00, 493.88, 587.33]  // G4, A4, B4, D5
        ];
    }
    
    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Master Volume (keep it soft and ambient)
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.setValueAtTime(0.08, this.ctx.currentTime);
        
        // Lowpass filter to make oscillators sound warm and cozy (cutting off sharp treble)
        this.filterNode = this.ctx.createBiquadFilter();
        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.setValueAtTime(950, this.ctx.currentTime);
        this.filterNode.Q.setValueAtTime(1, this.ctx.currentTime);
        
        // Dreamy Delay (Echo) Node
        this.delayNode = this.ctx.createDelay(1.0);
        this.delayNode.delayTime.setValueAtTime(0.38, this.ctx.currentTime); // 380ms spacing
        
        // Feedback Node for echo decay
        this.feedbackNode = this.ctx.createGain();
        this.feedbackNode.gain.setValueAtTime(0.45, this.ctx.currentTime); // 45% echo decay loop
        
        // Connect the delay feedback loop
        this.delayNode.connect(this.feedbackNode);
        this.feedbackNode.connect(this.delayNode);
        
        // Connections: Instrument -> Filter -> Gain -> Destination
        this.filterNode.connect(this.gainNode);
        this.filterNode.connect(this.delayNode);
        this.delayNode.connect(this.gainNode);
        
        this.gainNode.connect(this.ctx.destination);
    }
    
    playTone(freq, duration, oscType = 'triangle', gainVal = 0.25) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        
        osc.type = oscType;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        // ADSR Envelope: Fast attack, long smooth exponential decay
        oscGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
        oscGain.gain.linearRampToValueAtTime(gainVal, this.ctx.currentTime + 0.04);
        oscGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        
        osc.connect(oscGain);
        oscGain.connect(this.filterNode);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
    
    start() {
        this.init();
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.ctx.resume();
        
        let step = 0;
        const stepInterval = 850; // Tempo speed (ms)
        
        const sequenceTick = () => {
            const chordIdx = Math.floor(step / 8) % this.chords.length;
            const currentChord = this.chords[chordIdx];
            const currentMelodySet = this.melody[chordIdx];
            const beat = step % 8;
            
            // Play low lush pad chord on beat 0
            if (beat === 0) {
                // Ground bass note (sine wave for deep comfort)
                this.playTone(currentChord[0], 6.0, 'sine', 0.45);
                // Triad chord pad
                this.playTone(currentChord[1], 5.0, 'triangle', 0.15);
                this.playTone(currentChord[2], 5.0, 'triangle', 0.15);
                this.playTone(currentChord[3], 5.0, 'triangle', 0.15);
            }
            
            // Soft random-like arpeggiated chime sequences
            if (beat === 1 || beat === 3 || beat === 5 || beat === 6) {
                let noteIndex = 0;
                if (beat === 1) noteIndex = 2;
                else if (beat === 3) noteIndex = 3;
                else if (beat === 5) noteIndex = 1;
                else noteIndex = 0;
                
                const freq = currentMelodySet[noteIndex];
                
                // Play soft primary bell note
                this.playTone(freq, 2.5, 'sine', 0.35);
                // Add a tiny upper octave harmonic tick
                this.playTone(freq * 2, 0.4, 'sine', 0.08);
            }
            
            step++;
        };
        
        sequenceTick();
        this.intervalId = setInterval(sequenceTick, stepInterval);
    }
    
    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}

const synth = new DreamSynth();

// ==========================================
// 5. Canvas Particle System
// ==========================================
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

let particles = [];
let celebrationMode = false;
let width = window.innerWidth;
let height = window.innerHeight;

// Helper to draw standard symmetric heart path
function drawHeartPath(c, x, y, size) {
    c.beginPath();
    c.moveTo(x, y - size / 4);
    c.bezierCurveTo(x - size / 2, y - size, x - size, y - size / 3, x, y + size * 0.85);
    c.bezierCurveTo(x + size, y - size / 3, x + size / 2, y - size, x, y - size / 4);
    c.closePath();
}

// Particle Classes
class Heart {
    constructor() { this.reset(true); }
    reset(randomStart = false) {
        this.size = Math.random() * 12 + 8;
        this.x = Math.random() * width;
        this.y = randomStart ? Math.random() * height : height + this.size;
        this.speedY = Math.random() * 0.7 + 0.3;
        this.swaySpeed = Math.random() * 0.02 + 0.01;
        this.swayAngle = Math.random() * Math.PI * 2;
        this.swayWidth = Math.random() * 1.5 + 0.5;
        this.alpha = Math.random() * 0.5 + 0.3;
        
        const colors = [
            { r: 244, g: 143, b: 177 }, // Pink
            { r: 206, g: 147, b: 216 }, // Lavender
            { r: 248, g: 187, b: 208 }, // Soft Rose
            { r: 255, g: 245, b: 230 }  // Warm cream
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    update() {
        this.y -= this.speedY;
        this.swayAngle += this.swaySpeed;
        this.x += Math.sin(this.swayAngle) * this.swayWidth;
        
        if (this.y < height * 0.15) {
            this.alpha -= 0.005;
        }
        
        return this.y < -this.size || this.alpha <= 0;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`;
        drawHeartPath(ctx, this.x, this.y, this.size);
        ctx.fill();
        ctx.restore();
    }
}

class Sparkle {
    constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 4 + 2;
        this.alpha = Math.random() * 0.3 + 0.1;
        this.glowSpeed = Math.random() * 0.03 + 0.01;
        this.glowAngle = Math.random() * Math.PI;
    }
    update() {
        this.glowAngle += this.glowSpeed;
        this.alpha = Math.max(0.05, Math.abs(Math.sin(this.glowAngle)) * 0.6);
        return false;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.moveTo(this.x - this.size, this.y);
        ctx.lineTo(this.x + this.size, this.y);
        ctx.moveTo(this.x, this.y - this.size);
        ctx.lineTo(this.x, this.y + this.size);
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.strokeStyle = isDark ? 'rgba(255, 236, 179, 1)' : 'rgba(219, 39, 119, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
    }
}

class Confetti {
    constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * -50 - 10;
        this.sizeWidth = Math.random() * 6 + 6;
        this.sizeHeight = Math.random() * 10 + 6;
        this.speedY = Math.random() * 2 + 1.5;
        this.speedX = Math.random() * 1.5 - 0.75;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = Math.random() * 0.05 - 0.025;
        this.rotationX = Math.random() * Math.PI;
        this.rotationXSpeed = Math.random() * 0.08 + 0.02;
        
        const hues = [340, 280, 20, 190, 50, 320];
        this.color = `hsl(${hues[Math.floor(Math.random() * hues.length)]}, 100%, 70%)`;
    }
    update() {
        this.y += this.speedY;
        this.x += this.speedX;
        this.rotation += this.rotationSpeed;
        this.rotationX += this.rotationXSpeed;
        return this.y > height + 20;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.scale(Math.max(-1, Math.min(1, Math.cos(this.rotationX))), 1);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.sizeWidth / 2, -this.sizeHeight / 2, this.sizeWidth, this.sizeHeight);
        ctx.restore();
    }
}

class Balloon {
    constructor() {
        this.radius = Math.random() * 12 + 14;
        this.x = Math.random() * (width - this.radius * 2) + this.radius;
        this.y = height + this.radius * 2 + Math.random() * 100;
        this.speedY = Math.random() * 1.0 + 1.0;
        this.swayAngle = Math.random() * Math.PI;
        this.swaySpeed = Math.random() * 0.02 + 0.01;
        this.swayWidth = Math.random() * 0.8 + 0.4;
        
        const colors = [
            'rgba(244, 143, 177, 0.85)',
            'rgba(186, 104, 200, 0.85)',
            'rgba(100, 181, 246, 0.85)',
            'rgba(129, 199, 132, 0.85)',
            'rgba(255, 213, 79, 0.85)'
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    update() {
        this.y -= this.speedY;
        this.swayAngle += this.swaySpeed;
        this.x += Math.sin(this.swayAngle) * this.swayWidth;
        return this.y < -this.radius * 4;
    }
    draw() {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.radius);
        ctx.bezierCurveTo(this.x - 6, this.y + this.radius + 15, this.x + 6, this.y + this.radius + 28, this.x, this.y + this.radius + 40);
        ctx.strokeStyle = 'rgba(170, 170, 170, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.radius - 2);
        ctx.lineTo(this.x - 5, this.y + this.radius + 6);
        ctx.lineTo(this.x + 5, this.y + this.radius + 6);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x - this.radius * 0.35, this.y - this.radius * 0.35, this.radius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fill();
        ctx.restore();
    }
}

class Rocket {
    constructor() {
        this.x = Math.random() * (width - 150) + 75;
        this.y = height + 10;
        this.targetY = Math.random() * (height * 0.45) + height * 0.1;
        this.speed = Math.random() * 4 + 7;
        this.angle = -Math.PI / 2 + (Math.random() * 0.15 - 0.075);
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.hue = Math.random() * 360;
        this.color = `hsl(${this.hue}, 100%, 75%)`;
        this.trail = [];
    }
    update() {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 8) this.trail.shift();
        
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.04;
        
        const exploded = this.vy >= 0 || this.y <= this.targetY;
        if (exploded) this.explode();
        return exploded;
    }
    explode() {
        const numSparks = 45 + Math.floor(Math.random() * 15);
        for (let i = 0; i < numSparks; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4.5 + 1.5;
            const sparkColor = `hsl(${this.hue + (Math.random() * 30 - 15)}, 100%, 70%)`;
            particles.push(new FireworkSpark(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed, sparkColor));
        }
    }
    draw() {
        ctx.save();
        ctx.beginPath();
        if (this.trail.length > 0) {
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
        }
        ctx.lineTo(this.x, this.y);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
    }
}

class FireworkSpark {
    constructor(x, y, vx, vy, color) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.alpha = 1;
        this.decay = Math.random() * 0.015 + 0.012;
        this.gravity = 0.09;
        this.friction = 0.965;
    }
    update() {
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
        return this.alpha <= 0;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}

function initParticles() {
    resizeCanvas();
    for (let i = 0; i < 20; i++) particles.push(new Heart());
    for (let i = 0; i < 35; i++) particles.push(new Sparkle());
}

function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
}

let lastBalloonSpawn = 0;
let lastRocketSpawn = 0;

function animate(time) {
    ctx.clearRect(0, 0, width, height);
    
    // Maintain ambient particle counts
    const hearts = particles.filter(p => p instanceof Heart);
    if (hearts.length < 18) particles.push(new Heart());
    
    if (celebrationMode) {
        if (Math.random() < 0.22) particles.push(new Confetti());
        
        if (time - lastBalloonSpawn > 1800) {
            particles.push(new Balloon());
            lastBalloonSpawn = time;
        }
        if (time - lastRocketSpawn > 2200) {
            particles.push(new Rocket());
            lastRocketSpawn = time;
        }
    }
    
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const isDead = p.update();
        if (isDead) {
            particles.splice(i, 1);
        } else {
            p.draw();
        }
    }
    requestAnimationFrame(animate);
}

window.addEventListener('resize', resizeCanvas);

// ==========================================
// 6. Navigation and Scrapbook Progress Flow
// ==========================================
const heroSection = document.getElementById('hero-section');
const mainContent = document.getElementById('main-content');
const openBtn = document.getElementById('open-btn');
const steps = document.querySelectorAll('.timeline-step');
const panes = document.querySelectorAll('.chapter-pane');

openBtn.addEventListener('click', () => {
    heroSection.classList.add('fade-out');
    
    // Spawn initial confetti burst
    celebrationMode = true;
    setTimeout(() => { celebrationMode = false; }, 4000); // 4s burst
    
    setTimeout(() => {
        heroSection.style.display = 'none';
        mainContent.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        if (!isMuted) {
            synth.start();
            musicToggle.classList.add('playing');
            musicIcon.textContent = '🎶';
            musicTooltip.textContent = 'Mute Music';
        }
    }, 800);
});

function unlockChapter(chapterNum) {
    if (unlockedChapters.includes(chapterNum)) return;
    unlockedChapters.push(chapterNum);
    
    const stepEl = document.getElementById(`nav-ch-${chapterNum}`);
    if (stepEl) {
        stepEl.classList.remove('locked');
        stepEl.classList.add('unlocked');
        
        const btn = stepEl.querySelector('.step-btn');
        btn.removeAttribute('disabled');
        btn.querySelector('.step-num').textContent = chapterNum;
    }
}

function goToChapter(chapterNum) {
    if (!unlockedChapters.includes(chapterNum)) return;
    
    // Update navigation active states
    steps.forEach(step => {
        const num = parseInt(step.getAttribute('data-chapter'));
        step.classList.remove('active');
        if (num === chapterNum) {
            step.classList.add('active');
        }
    });

    // Toggle panes
    panes.forEach(pane => {
        pane.classList.add('hidden');
        pane.classList.remove('active');
    });
    
    const targetPane = document.getElementById(`chapter-${chapterNum}`);
    if (targetPane) {
        targetPane.classList.remove('hidden');
        // Add tiny timeout for opacity slide-up transition
        setTimeout(() => { targetPane.classList.add('active'); }, 50);
        window.scrollTo({ top: targetPane.offsetTop - 120, behavior: 'smooth' });
    }
}

// Bind navigation clicks
steps.forEach(step => {
    const btn = step.querySelector('.step-btn');
    btn.addEventListener('click', () => {
        const chapterNum = parseInt(step.getAttribute('data-chapter'));
        goToChapter(chapterNum);
    });
});

// Helper fallback uploader drawer
function fallbackImage(imgId, fallbackId) {
    const img = document.getElementById(imgId);
    const fallback = document.getElementById(fallbackId);
    if (img && fallback) {
        img.style.display = 'none';
        fallback.classList.remove('hidden');
    }
}

// ==========================================
// 7. CHAPTER 1: GUESS WHO GAME
// ==========================================
let currentGuessIdx = 0;
const guessImage = document.getElementById('guess-image');
const guessQuestion = document.getElementById('guess-question');
const guessCaption = document.getElementById('guess-caption');
const guessRevealBtn = document.getElementById('guess-reveal-btn');
const guessNextBtn = document.getElementById('guess-next-btn');
const guessProgressText = document.getElementById('guess-progress-text');
const guessFallback = document.getElementById('guess-image-fallback');

function renderGuessWho() {
    if (!config.guessWho || config.guessWho.length === 0) return;
    
    const item = config.guessWho[currentGuessIdx];
    guessImage.src = item.imagePath;
    guessImage.style.display = 'block';
    guessImage.classList.add('blurred-image');
    guessFallback.classList.add('hidden');
    guessFallback.querySelector('.placeholder-text').textContent = `${item.imagePath} missing`;
    
    guessQuestion.textContent = item.question;
    guessCaption.classList.add('hidden');
    guessRevealBtn.classList.remove('hidden');
    guessNextBtn.classList.add('hidden');
    
    guessProgressText.textContent = `Photo ${currentGuessIdx + 1} of ${config.guessWho.length}`;

    // Handle missing image
    guessImage.onerror = () => {
        fallbackImage('guess-image', 'guess-image-fallback');
    };
}

guessRevealBtn.addEventListener('click', () => {
    guessImage.classList.remove('blurred-image');
    guessRevealBtn.classList.add('hidden');
    guessCaption.textContent = config.guessWho[currentGuessIdx].caption;
    guessCaption.classList.remove('hidden');
    guessNextBtn.classList.remove('hidden');
});

guessNextBtn.addEventListener('click', () => {
    if (currentGuessIdx < config.guessWho.length - 1) {
        currentGuessIdx++;
        renderGuessWho();
    } else {
        // Completed Guess Who!
        unlockChapter(2);
        goToChapter(2);
    }
});

// ==========================================
// 8. CHAPTER 2: POLAROID GALLERY & SCRATCH CARD
// ==========================================
const polaroidsGrid = document.getElementById('polaroids-grid');
const lightboxModal = document.getElementById('lightbox-modal');
const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxLocation = document.getElementById('lightbox-location');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxHandwritten = document.getElementById('lightbox-handwritten');
const downloadKeepsakeBtn = document.getElementById('download-keepsake-btn');
const ch2CompleteBtn = document.getElementById('ch2-complete-btn');

let currentLightboxItem = null;

function renderPolaroids() {
    if (!config.gallery) return;
    polaroidsGrid.innerHTML = '';
    
    config.gallery.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'polaroid-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Memory: ${item.caption}`);
        
        card.innerHTML = `
            <div class="polaroid-img-wrapper">
                <img src="${item.imagePath}" alt="${item.caption}" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden')">
                <div class="img-placeholder hidden">
                    <span class="placeholder-icon">📸</span>
                    <span class="placeholder-text">${item.imagePath} missing</span>
                </div>
            </div>
            <div class="polaroid-caption">${item.caption}</div>
        `;
        
        const openLightbox = () => {
            currentLightboxItem = item;
            viewedPolaroids.add(index);
            
            lightboxImg.src = item.imagePath;
            lightboxLocation.textContent = item.location || '';
            lightboxCaption.textContent = item.caption;
            lightboxHandwritten.textContent = item.handwrittenNote || '';
            
            // Check missing image in lightbox
            lightboxImg.style.display = 'block';
            const keepsakeCard = document.getElementById('polaroid-keepsake-card');
            let pl = keepsakeCard.querySelector('.img-placeholder');
            if (pl) pl.remove();
            
            lightboxImg.onerror = () => {
                lightboxImg.style.display = 'none';
                const plDiv = document.createElement('div');
                plDiv.className = 'img-placeholder';
                plDiv.innerHTML = `<span class="placeholder-icon">📸</span><span class="placeholder-text">${item.imagePath} missing</span>`;
                keepsakeCard.querySelector('.keepsake-image-wrapper').appendChild(plDiv);
            };

            lightboxModal.classList.remove('hidden');
            checkCh2Requirements();
        };

        card.addEventListener('click', openLightbox);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openLightbox();
            }
        });
        
        polaroidsGrid.appendChild(card);
    });
}

function checkCh2Requirements() {
    // Requirements: viewed at least 3 polaroids AND completed scratch card
    if (viewedPolaroids.size >= 3 && scratchOpened) {
        ch2CompleteBtn.removeAttribute('disabled');
        ch2CompleteBtn.querySelector('span').textContent = "Proceed to Chapter 3 ✨";
        ch2CompleteBtn.classList.add('ready');
    } else {
        let msg = "Proceed to Chapter 3 🔒";
        if (viewedPolaroids.size < 3) {
            msg = `View ${3 - viewedPolaroids.size} more memories 🔒`;
        } else if (!scratchOpened) {
            msg = "Scratch your card to unlock 🔒";
        }
        ch2CompleteBtn.setAttribute('disabled', 'true');
        ch2CompleteBtn.querySelector('span').textContent = msg;
    }
}

lightboxCloseBtn.addEventListener('click', () => { lightboxModal.classList.add('hidden'); });
lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) lightboxModal.classList.add('hidden');
});

// Download Polaroid Keepsake Canvas Creator
downloadKeepsakeBtn.addEventListener('click', () => {
    if (!currentLightboxItem) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 500;
    const sctx = canvas.getContext('2d');
    
    // Draw white polaroid backing
    sctx.fillStyle = '#FFFFFF';
    sctx.fillRect(0, 0, 400, 500);
    
    // Load image and render
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = currentLightboxItem.imagePath;
    img.onload = () => {
        sctx.drawImage(img, 25, 25, 350, 350);
        
        // Location
        sctx.fillStyle = '#8B5CF6';
        sctx.font = 'bold 12px "Quicksand", sans-serif';
        sctx.textAlign = 'center';
        sctx.fillText((currentLightboxItem.location || "").toUpperCase(), 200, 405);
        
        // Caption
        sctx.fillStyle = '#3C2E59';
        sctx.font = 'bold 20px "Quicksand", sans-serif';
        sctx.fillText(currentLightboxItem.caption || "", 200, 430);
        
        // Cursive Note
        sctx.fillStyle = '#EC4899';
        sctx.font = '28px "Caveat", cursive';
        sctx.fillText(currentLightboxItem.handwrittenNote || "", 200, 465);
        
        // Download
        const link = document.createElement('a');
        link.download = `polaroid_${currentLightboxItem.id || Date.now()}.webp`;
        link.href = canvas.toDataURL('image/webp');
        link.click();
    };
    img.onerror = () => {
        // Fallback draw
        sctx.fillStyle = '#F3E8FF';
        sctx.fillRect(25, 25, 350, 350);
        sctx.fillStyle = '#8B5CF6';
        sctx.font = '40px "Quicksand", sans-serif';
        sctx.textAlign = 'center';
        sctx.fillText("📸", 200, 200);
        
        // Text details
        sctx.fillStyle = '#8B5CF6';
        sctx.font = 'bold 12px "Quicksand", sans-serif';
        sctx.fillText((currentLightboxItem.location || "").toUpperCase(), 200, 405);
        sctx.fillStyle = '#3C2E59';
        sctx.font = 'bold 20px "Quicksand", sans-serif';
        sctx.fillText(currentLightboxItem.caption || "", 200, 430);
        sctx.fillStyle = '#EC4899';
        sctx.font = '28px "Caveat", cursive';
        sctx.fillText(currentLightboxItem.handwrittenNote || "", 200, 465);
        
        const link = document.createElement('a');
        link.download = `polaroid_card_${Date.now()}.webp`;
        link.href = canvas.toDataURL('image/webp');
        link.click();
    };
});

ch2CompleteBtn.addEventListener('click', () => {
    unlockChapter(3);
    goToChapter(3);
});

// ==========================================
// 8b. SCRATCH CARD MECHANICS
// ==========================================
const scratchModal = document.getElementById('scratch-modal');
const openScratchBtn = document.getElementById('open-scratch-btn');
const scratchCloseBtn = document.getElementById('scratch-close-btn');
const scratchCanvas = document.getElementById('scratch-canvas');
const sctx = scratchCanvas.getContext('2d');
const scratchDoneBtn = document.getElementById('scratch-done-btn');

let isScratching = false;

function initScratchCard() {
    const sc = config.scratchCard;
    document.getElementById('scratch-title').textContent = sc.title;
    document.getElementById('scratch-instruction').textContent = sc.instruction;
    document.getElementById('scratch-coupon-code').textContent = sc.couponText;
    document.querySelector('.coupon-sub').textContent = sc.subtext;
    
    // Draw silver foil
    sctx.globalCompositeOperation = 'source-over';
    sctx.fillStyle = '#C0C0C0'; // Silver color
    sctx.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    
    // Draw diagonal lines for metallic look
    sctx.strokeStyle = '#A9A9A9';
    sctx.lineWidth = 2;
    for (let i = -100; i < scratchCanvas.width; i += 20) {
        sctx.beginPath();
        sctx.moveTo(i, 0);
        sctx.lineTo(i + 100, scratchCanvas.height);
        sctx.stroke();
    }
    
    // Print invitation
    sctx.fillStyle = '#4A4A4A';
    sctx.font = 'bold 13px "Quicksand", sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText("SCRATCH WITH MOUSE/FINGER 🍀", scratchCanvas.width / 2, scratchCanvas.height / 2 + 5);
    
    scratchDoneBtn.classList.add('hidden');
    scratchCanvas.style.opacity = 1;
    scratchCanvas.style.display = 'block';
    scratchCanvas.style.transition = 'none';
}

openScratchBtn.addEventListener('click', () => {
    initScratchCard();
    scratchModal.classList.remove('hidden');
});

scratchCloseBtn.addEventListener('click', () => { scratchModal.classList.add('hidden'); });

// Scratch event bindings
function getMousePos(canvasDom, e) {
    const rect = canvasDom.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function scratch(e) {
    if (!isScratching) return;
    e.preventDefault();
    
    const pos = getMousePos(scratchCanvas, e);
    sctx.globalCompositeOperation = 'destination-out';
    sctx.beginPath();
    sctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
    sctx.fill();
    
    checkScratchPercentage();
}

function checkScratchPercentage() {
    const imgData = sctx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height);
    const pixels = imgData.data;
    let transparentCount = 0;
    
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 128) transparentCount++;
    }
    
    const percent = (transparentCount / (scratchCanvas.width * scratchCanvas.height)) * 100;
    if (percent > 55) {
        // Erase foil completely
        scratchCanvas.style.transition = 'opacity 0.6s ease';
        scratchCanvas.style.opacity = 0;
        setTimeout(() => {
            scratchCanvas.style.display = 'none';
            scratchDoneBtn.classList.remove('hidden');
            
            // Mark scratch card opened
            scratchOpened = true;
            checkCh2Requirements();
        }, 600);
    }
}

scratchCanvas.addEventListener('mousedown', () => isScratching = true);
scratchCanvas.addEventListener('touchstart', () => isScratching = true);

window.addEventListener('mouseup', () => isScratching = false);
window.addEventListener('touchend', () => isScratching = false);

scratchCanvas.addEventListener('mousemove', scratch);
scratchCanvas.addEventListener('touchmove', scratch);

scratchDoneBtn.addEventListener('click', () => {
    scratchModal.classList.add('hidden');
});

// ==========================================
// 9. CHAPTER 3: QUIZ ON US
// ==========================================
let currentQuizIdx = 0;
let quizScore = 0;
const quizQuestionNum = document.getElementById('quiz-question-num');
const quizQuestionText = document.getElementById('quiz-question-text');
const quizOptionsGrid = document.getElementById('quiz-options-grid');
const quizFeedbackBox = document.getElementById('quiz-feedback-box');
const quizFeedbackText = document.getElementById('quiz-feedback-text');
const quizNextBtnBox = document.getElementById('quiz-next-btn-panel');
const quizQuestionBox = document.getElementById('quiz-question-box');
const quizScoreBox = document.getElementById('quiz-score-box');
const ch3CompleteBtn = document.getElementById('ch3-complete-btn');

function renderQuizQuestion() {
    if (!config.quiz || config.quiz.length === 0) return;
    
    const q = config.quiz[currentQuizIdx];
    quizQuestionNum.textContent = `Question ${currentQuizIdx + 1} of ${config.quiz.length}`;
    quizQuestionText.textContent = q.question;
    
    quizOptionsGrid.innerHTML = '';
    quizFeedbackBox.classList.add('hidden');
    
    q.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-opt-btn';
        btn.textContent = opt;
        btn.addEventListener('click', () => handleQuizAnswer(index, btn));
        quizOptionsGrid.appendChild(btn);
    });
}

function handleQuizAnswer(selectedIndex, clickedBtn) {
    const q = config.quiz[currentQuizIdx];
    const buttons = quizOptionsGrid.querySelectorAll('.quiz-opt-btn');
    
    // Disable all options
    buttons.forEach(btn => btn.setAttribute('disabled', 'true'));
    
    if (selectedIndex === q.answer) {
        clickedBtn.classList.add('correct');
        quizFeedbackText.textContent = `Correct! ${q.funnyFeedback || ''}`;
        quizScore++;
        
        // Play correct tone
        synth.playTone(523.25, 0.15, 'sine', 0.2); // C5
        setTimeout(() => synth.playTone(659.25, 0.3, 'sine', 0.2), 100); // E5
    } else {
        clickedBtn.classList.add('incorrect');
        // Highlight correct option in green
        buttons[q.answer].classList.add('correct');
        quizFeedbackText.textContent = `Oh no! ${q.funnyFeedback || ''}`;
        
        // Play incorrect tone
        synth.playTone(293.66, 0.4, 'triangle', 0.3); // D4
    }
    
    quizFeedbackBox.classList.remove('hidden');
}

quizNextBtnBox.addEventListener('click', () => {
    if (currentQuizIdx < config.quiz.length - 1) {
        currentQuizIdx++;
        renderQuizQuestion();
    } else {
        // End of quiz
        quizQuestionBox.classList.add('hidden');
        quizScoreBox.classList.remove('hidden');
        
        // Show stars based on score
        const starView = quizScoreBox.querySelector('.score-stars');
        if (quizScore >= 4) starView.textContent = "⭐⭐⭐";
        else if (quizScore >= 2) starView.textContent = "⭐⭐";
        else starView.textContent = "⭐";
    }
});

ch3CompleteBtn.addEventListener('click', () => {
    unlockChapter(4);
    goToChapter(4);
});

// ==========================================
// 10. CHAPTER 4: WHY YOU'RE AMAZING (CARDS)
// ==========================================
const reasonsGrid = document.getElementById('reasons-grid');
const reasonsProgText = document.getElementById('reasons-progress-text');
const reasonsProgBar = document.getElementById('reasons-progress-bar');
const reasonsRevealAllBtn = document.getElementById('reasons-reveal-all');
const ch4CompleteBtn = document.getElementById('ch4-complete-btn');

function renderReasons() {
    if (!config.reasons) return;
    reasonsGrid.innerHTML = '';
    openedReasons.clear();
    updateReasonsProgress();
    
    config.reasons.forEach((reason, index) => {
        const cardNum = index + 1;
        const card = document.createElement('div');
        card.className = 'card-container';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Reason ${cardNum}. Click to open.`);
        card.setAttribute('data-id', index);
        
        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    <span class="card-front-icon" aria-hidden="true">❤️</span>
                    <p class="card-front-title">Reason #${cardNum}</p>
                    <p class="card-front-prompt">Click to Open</p>
                </div>
                <div class="card-back">
                    <div class="card-back-number">Reason #${cardNum}</div>
                    <p class="card-back-message">${reason}</p>
                </div>
            </div>
        `;
        
        const flip = () => {
            const inner = card.querySelector('.card-inner');
            if (inner.classList.contains('flipped')) return;
            
            inner.classList.add('flipped');
            card.setAttribute('aria-label', `Reason ${cardNum}. Revealed: ${reason}`);
            openedReasons.add(index);
            updateReasonsProgress();
            
            // Soft bell chime play
            synth.playTone(523.25 + (index * 15), 0.5, 'sine', 0.2);
        };
        
        card.addEventListener('click', flip);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                flip();
            }
        });
        
        reasonsGrid.appendChild(card);
    });
}

function updateReasonsProgress() {
    const count = openedReasons.size;
    const total = config.reasons ? config.reasons.length : 30;
    
    reasonsProgText.textContent = `${count} of ${total} reasons opened`;
    
    const pct = (count / total) * 100;
    reasonsProgBar.style.width = `${pct}%`;
    
    if (count === total) {
        ch4CompleteBtn.removeAttribute('disabled');
        ch4CompleteBtn.querySelector('span').textContent = "Proceed to Chapter 5 ✨";
        ch4CompleteBtn.classList.add('ready');
    } else {
        ch4CompleteBtn.setAttribute('disabled', 'true');
        ch4CompleteBtn.querySelector('span').textContent = `Reveal all cards to unlock (${count}/${total}) 🔒`;
    }
}

reasonsRevealAllBtn.addEventListener('click', () => {
    const cards = reasonsGrid.querySelectorAll('.card-container');
    cards.forEach((card, index) => {
        const inner = card.querySelector('.card-inner');
        const cardId = parseInt(card.getAttribute('data-id'));
        if (!inner.classList.contains('flipped')) {
            setTimeout(() => {
                inner.classList.add('flipped');
                openedReasons.add(cardId);
                updateReasonsProgress();
            }, index * 80); // Stagger cards flip cascade
        }
    });
});

ch4CompleteBtn.addEventListener('click', () => {
    unlockChapter(5);
    goToChapter(5);
});

// ==========================================
// 11. CHAPTER 5: SECRET LETTERS (ENVELOPES)
// ==========================================
const envelopesGrid = document.getElementById('envelopes-grid');
const letterModal = document.getElementById('letter-modal');
const letterCloseBtn = document.getElementById('letter-close-btn');
const letterModalSubject = document.getElementById('letter-modal-subject');
const letterModalTitle = document.getElementById('letter-modal-title');
const letterModalBody = document.getElementById('letter-modal-body');
const ch5CompleteBtn = document.getElementById('ch5-complete-btn');

function renderEnvelopes() {
    if (!config.letters) return;
    envelopesGrid.innerHTML = '';
    openedLetters.clear();
    updateLettersProgress();
    
    config.letters.forEach((item, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'envelope-wrapper';
        wrapper.setAttribute('data-id', index);
        
        wrapper.innerHTML = `
            <div class="envelope">
                <div class="envelope-flap"></div>
                <div class="envelope-paper">
                    <p class="paper-preview-text">${item.body.substring(0, 70)}...</p>
                </div>
                <div class="envelope-front-pocket">
                    <div class="envelope-stamp" aria-hidden="true">💌</div>
                    <div class="envelope-label">${item.title}</div>
                </div>
            </div>
        `;
        
        wrapper.addEventListener('click', () => {
            if (!wrapper.classList.contains('open')) {
                wrapper.classList.add('open');
                synth.playTone(392.00, 0.1, 'triangle', 0.25); // G4
                setTimeout(() => synth.playTone(523.25, 0.4, 'sine', 0.25), 100); // C5
            } else {
                // Clicking when already open shows letter details
                openLetterDetails(item, index);
            }
        });
        
        envelopesGrid.appendChild(wrapper);
    });
}

function openLetterDetails(item, index) {
    letterModalSubject.textContent = item.subject || '';
    letterModalTitle.textContent = item.title;
    letterModalBody.textContent = item.body;
    
    letterModal.classList.remove('hidden');
    
    openedLetters.add(index);
    updateLettersProgress();
}

function updateLettersProgress() {
    const count = openedLetters.size;
    const total = config.letters ? config.letters.length : 4;
    
    if (count === total) {
        ch5CompleteBtn.removeAttribute('disabled');
        ch5CompleteBtn.querySelector('span').textContent = "Proceed to Chapter 6 ✨";
        ch5CompleteBtn.classList.add('ready');
    } else {
        ch5CompleteBtn.setAttribute('disabled', 'true');
        ch5CompleteBtn.querySelector('span').textContent = `Read all ${total} letters to unlock (${count}/${total}) 🔒`;
    }
}

letterCloseBtn.addEventListener('click', () => { letterModal.classList.add('hidden'); });
letterModal.addEventListener('click', (e) => {
    if (e.target === letterModal) letterModal.classList.add('hidden');
});

ch5CompleteBtn.addEventListener('click', () => {
    unlockChapter(6);
    goToChapter(6);
});

// ==========================================
// 12. CHAPTER 6: BIRTHDAY CAKE & TYPING CLIMAX
// ==========================================
const candles = document.querySelectorAll('.candle');
const cakeInstruction = document.getElementById('cake-instruction-text');
const finalClimaxCard = document.getElementById('final-climax-card');
const climaxTypewriterText = document.getElementById('climax-typewriter-text');

function setupCandles() {
    blownCandles.clear();
    finalClimaxCard.classList.add('hidden');
    climaxTypewriterText.textContent = '';
    
    candles.forEach((candle, index) => {
        candle.classList.remove('extinguished');
        
        const blowOut = () => {
            if (candle.classList.contains('extinguished')) return;
            
            candle.classList.add('extinguished');
            blownCandles.add(index);
            
            // Soft blowing noise or synth note
            synth.playTone(392.00 - (index * 50), 0.1, 'sine', 0.25);
            synth.playTone(261.63, 0.4, 'triangle', 0.15);
            
            if (blownCandles.size === candles.length) {
                triggerFinalClimax();
            }
        };
        
        candle.addEventListener('click', blowOut);
        candle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                blowOut();
            }
        });
    });
}

function triggerFinalClimax() {
    cakeInstruction.textContent = "🎂 Make a wish! All candles blown! 🎉";
    celebrationMode = true;
    
    // Play celebratory bell climb
    const climbFreqs = [523.25, 587.33, 659.25, 783.99, 880.00, 987.77, 1046.50];
    climbFreqs.forEach((f, idx) => {
        setTimeout(() => synth.playTone(f, 0.8, 'sine', 0.3), idx * 150);
    });

    // Reveal typing letter card
    setTimeout(() => {
        finalClimaxCard.classList.remove('hidden');
        typeMessage(config.climaxMessage || "HAPPY BIRTHDAY!");
    }, 1500);
}

function typeMessage(text) {
    climaxTypewriterText.textContent = '';
    let idx = 0;
    
    function type() {
        if (idx < text.length) {
            climaxTypewriterText.textContent += text[idx];
            idx++;
            
            // Random tiny audio tick for type clicks
            if (Math.random() < 0.3) {
                synth.playTone(600, 0.02, 'sine', 0.05);
            }
            
            setTimeout(type, 45); // Speed of typewriter (45ms)
        }
    }
    
    type();
}

// ==========================================
// 13. EASTER EGGS WIDGET PORTAL
// ==========================================
const eggModal = document.getElementById('egg-modal');
const eggCloseBtn = document.getElementById('egg-close-btn');
const eggIcon = document.getElementById('egg-icon');
const eggTitle = document.getElementById('egg-title-text');
const eggMsg = document.getElementById('egg-message');

function setupEasterEggs() {
    for (let i = 1; i <= 3; i++) {
        const btn = document.getElementById(`easter-egg-${i}`);
        if (btn) {
            btn.addEventListener('click', () => {
                const data = config.easterEggs[i - 1];
                if (!data) return;
                
                eggIcon.textContent = data.icon || '💖';
                eggTitle.textContent = data.title;
                eggMsg.textContent = data.message;
                
                eggModal.classList.remove('hidden');
                
                // Play tiny chime
                synth.playTone(880.00, 0.4, 'sine', 0.25);
            });
        }
    }
}

eggCloseBtn.addEventListener('click', () => { eggModal.classList.add('hidden'); });
eggModal.addEventListener('click', (e) => {
    if (e.target === eggModal) eggModal.classList.add('hidden');
});

// ==========================================
// 14. MUSIC & THEME GLOBAL INTERACTIONS
// ==========================================
const musicToggle = document.getElementById('music-toggle');
const musicIcon = musicToggle.querySelector('.music-icon');
const musicTooltip = musicToggle.querySelector('.music-tooltip');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle.querySelector('.theme-icon');
const themeTooltip = themeToggle.querySelector('.theme-tooltip');

let isMuted = localStorage.getItem('music-muted') === 'true';

function setupMusicUI() {
    if (isMuted) {
        musicToggle.classList.remove('playing');
        musicIcon.textContent = '🔇';
        musicTooltip.textContent = 'Play Music';
    } else {
        musicToggle.classList.remove('playing');
        musicIcon.textContent = '🎵';
        musicTooltip.textContent = 'Play Music';
    }
}

function toggleMusic() {
    if (synth.isPlaying) {
        synth.stop();
        isMuted = true;
        localStorage.setItem('music-muted', 'true');
        musicToggle.classList.remove('playing');
        musicIcon.textContent = '🔇';
        musicTooltip.textContent = 'Play Music';
    } else {
        synth.start();
        isMuted = false;
        localStorage.setItem('music-muted', 'false');
        musicToggle.classList.add('playing');
        musicIcon.textContent = '🎶';
        musicTooltip.textContent = 'Mute Music';
    }
}

musicToggle.addEventListener('click', toggleMusic);

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(theme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    if (theme === 'dark') {
        themeIcon.textContent = '☀️';
        themeTooltip.textContent = 'Light Mode';
    } else {
        themeIcon.textContent = '🌙';
        themeTooltip.textContent = 'Dark Mode';
    }
}

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
});

// ==========================================
// 15. VISUAL CONTENT CONFIGURATOR PORTAL
// ==========================================
const configToggle = document.getElementById('config-toggle');
const configPortal = document.getElementById('config-portal');
const configCloseBtn = document.getElementById('config-close-btn');
const configApplyBtn = document.getElementById('config-apply-btn');
const configExportBtn = document.getElementById('config-export-btn');

// Dynamic form element containers
const configReasonsInputs = document.getElementById('config-reasons-inputs');
const configLettersInputs = document.getElementById('config-letters-inputs');
const configQuizInputs = document.getElementById('config-quiz-inputs');
const configStartDate = document.getElementById('config-start-date');
const configClimaxText = document.getElementById('config-climax-text');
const configScratchText = document.getElementById('config-scratch-text');

function setupConfigurator() {
    // 1. Populate general settings
    configStartDate.value = config.friendshipStartDate || '2018-09-01';
    configClimaxText.value = config.climaxMessage || '';
    configScratchText.value = config.scratchCard.couponText || '';

    // 2. Populate 30 appreciation reasons textareas
    configReasonsInputs.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const val = config.reasons[i] || '';
        const grp = document.createElement('div');
        grp.className = 'form-group';
        grp.innerHTML = `
            <label>Reason #${i + 1}:</label>
            <textarea class="form-control textarea-reason" data-index="${i}">${val}</textarea>
        `;
        configReasonsInputs.appendChild(grp);
    }

    // 3. Populate Letters textareas
    configLettersInputs.innerHTML = '';
    config.letters.forEach((item, index) => {
        const grp = document.createElement('div');
        grp.style.marginBottom = '1.5rem';
        grp.innerHTML = `
            <h5>Letter Envelope #${index + 1} (${item.title})</h5>
            <div class="form-group">
                <label>Envelope Label Title:</label>
                <input type="text" class="form-control letter-input-title" data-index="${index}" value="${item.title}">
            </div>
            <div class="form-group">
                <label>Inside Letter Subject Header:</label>
                <input type="text" class="form-control letter-input-subject" data-index="${index}" value="${item.subject || ''}">
            </div>
            <div class="form-group">
                <label>Letter Body Content:</label>
                <textarea class="form-control form-control-textarea letter-input-body" data-index="${index}" rows="5">${item.body}</textarea>
            </div>
        `;
        configLettersInputs.appendChild(grp);
    });

    // 4. Populate Quiz inputs
    configQuizInputs.innerHTML = '';
    config.quiz.forEach((q, qIndex) => {
        const box = document.createElement('div');
        box.style.borderBottom = '1px dashed var(--card-border)';
        box.style.paddingBottom = '1.2rem';
        box.style.marginBottom = '1.2rem';
        
        let optionsHTML = '';
        q.options.forEach((opt, optIndex) => {
            optionsHTML += `
                <div class="form-group" style="padding-left: 1.5rem;">
                    <label>Option ${optIndex + 1} ${q.answer === optIndex ? '(Correct Answer)' : ''}:</label>
                    <input type="text" class="form-control quiz-option-val" data-qid="${qIndex}" data-optid="${optIndex}" value="${opt}">
                </div>
            `;
        });

        box.innerHTML = `
            <h5>Question #${qIndex + 1}</h5>
            <div class="form-group">
                <label>Question text:</label>
                <input type="text" class="form-control quiz-q-val" data-qid="${qIndex}" value="${q.question}">
            </div>
            <div class="form-group">
                <label>Correct Answer Index (0 to 3):</label>
                <input type="number" min="0" max="3" class="form-control quiz-ans-val" data-qid="${qIndex}" value="${q.answer}">
            </div>
            <div class="form-group">
                <label>Feedback Commentary text:</label>
                <input type="text" class="form-control quiz-feed-val" data-qid="${qIndex}" value="${q.funnyFeedback || ''}">
            </div>
            ${optionsHTML}
        `;
        configQuizInputs.appendChild(box);
    });

    // Handle Config tabs switching
    const tabButtons = configPortal.querySelectorAll('.tab-btn');
    const tabPanels = configPortal.querySelectorAll('.tab-panel');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

configToggle.addEventListener('click', () => { configPortal.classList.remove('hidden'); });
configCloseBtn.addEventListener('click', () => { configPortal.classList.add('hidden'); });

function collectConfigData() {
    const collected = { ...config };

    // Reasons
    const reasonTextareas = configReasonsInputs.querySelectorAll('textarea');
    collected.reasons = [];
    reasonTextareas.forEach(t => {
        collected.reasons.push(t.value);
    });

    // Letters
    const letterBlocks = config.letters.map((orig, i) => {
        const item = { ...orig };
        item.title = configLettersInputs.querySelector(`.letter-input-title[data-index="${i}"]`).value;
        item.subject = configLettersInputs.querySelector(`.letter-input-subject[data-index="${i}"]`).value;
        item.body = configLettersInputs.querySelector(`.letter-input-body[data-index="${i}"]`).value;
        return item;
    });
    collected.letters = letterBlocks;

    // Quiz
    const quizBlocks = config.quiz.map((orig, qIdx) => {
        const item = { ...orig };
        item.question = configQuizInputs.querySelector(`.quiz-q-val[data-qid="${qIdx}"]`).value;
        item.answer = parseInt(configQuizInputs.querySelector(`.quiz-ans-val[data-qid="${qIdx}"]`).value);
        item.funnyFeedback = configQuizInputs.querySelector(`.quiz-feed-val[data-qid="${qIdx}"]`).value;
        
        item.options = [];
        for (let optIdx = 0; optIdx < 4; optIdx++) {
            const optVal = configQuizInputs.querySelector(`.quiz-option-val[data-qid="${qIdx}"][data-optid="${optIdx}"]`).value;
            item.options.push(optVal);
        }
        return item;
    });
    collected.quiz = quizBlocks;

    // Details
    collected.friendshipStartDate = configStartDate.value;
    collected.climaxMessage = configClimaxText.value;
    collected.scratchCard = { ...config.scratchCard };
    collected.scratchCard.couponText = configScratchText.value;

    return collected;
}

// Apply Locally (Reload page)
configApplyBtn.addEventListener('click', () => {
    const currentData = collectConfigData();
    localStorage.setItem('scrapbook_local_config', JSON.stringify(currentData));
    configPortal.classList.add('hidden');
    
    // Play alert beep
    synth.playTone(880, 0.1, 'sine', 0.2);
    setTimeout(() => { window.location.reload(); }, 150);
});

// Export Javascript config file
configExportBtn.addEventListener('click', () => {
    const currentData = collectConfigData();
    
    // Stringify back into window.scrapbookConfig format
    const outputString = `/**\n * Custom Scrapbook Configuration\n * Overwrite config.js in your directory to deploy!\n */\n\nwindow.scrapbookConfig = ${JSON.stringify(currentData, null, 4)};\n`;
    
    const blob = new Blob([outputString], { type: 'text/javascript' });
    const link = document.createElement('a');
    link.download = 'config.js';
    link.href = URL.createObjectURL(blob);
    link.click();
    
    synth.playTone(523.25, 0.1, 'sine', 0.2);
    setTimeout(() => synth.playTone(783.99, 0.3, 'sine', 0.2), 100);
});
