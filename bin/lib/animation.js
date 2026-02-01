#!/usr/bin/env node
/**
 * Beth Animation - Startup splash for the AI Agent Orchestrator
 * "I don't speak dipshit. I speak in consequences."
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ANSI escape codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const AMBER = '\x1b[38;2;218;165;32m';
const GOLD = '\x1b[38;2;255;215;0m';
const WHITE = '\x1b[38;2;255;255;255m';

// Beth's signature quotes
const QUOTES = [
  "I don't speak dipshit. I speak in consequences.",
  "They broke my wings and forgot I had claws.",
  "I believe in lovin' with your whole soul and destroying anything that wants to kill what you love.",
  "I'm the trailer park. I'm the tornado.",
  "Where's the fun in breaking one thing? When I fix something, I fix it for generations.",
  "I made two decisions based on fear and they cost me everything. I'll never make another.",
  "You want my opinion? You're getting it either way.",
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function hideCursor() {
  process.stdout.write('\x1b[?25l');
}

function showCursor() {
  process.stdout.write('\x1b[?25h');
}

function centerText(text, width = process.stdout.columns || 80) {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

async function typewriter(text, delay = 30) {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(delay);
  }
  console.log();
}

function getRandomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

async function glitchEffect(iterations = 5) {
  const glitchChars = '░▒▓█│┃┆┇┊┋╳╱╲';
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  
  for (let i = 0; i < iterations; i++) {
    clearScreen();
    for (let j = 0; j < 10; j++) {
      const col = Math.floor(Math.random() * (cols - 20));
      const row = Math.floor(Math.random() * (rows - 5) + 2);
      const r = Math.floor(Math.random() * 150 + 100);
      const g = Math.floor(Math.random() * 100 + 50);
      const b = Math.floor(Math.random() * 50);
      const char = glitchChars[Math.floor(Math.random() * glitchChars.length)];
      process.stdout.write(`\x1b[${row};${col}H\x1b[38;2;${r};${g};${b}m${char.repeat(4)}`);
    }
    await sleep(80);
  }
}

async function displayPortrait() {
  const artPath = join(__dirname, '..', '..', 'assets', 'beth-portrait.txt');
  
  if (!existsSync(artPath)) {
    console.log(`${DIM}Portrait file not found at: ${artPath}${RESET}`);
    return false;
  }
  
  const art = readFileSync(artPath, 'utf-8');
  console.log(art);
  return true;
}

function displayBanner() {
  console.log();
  console.log(`${GOLD}${BOLD}${centerText('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}${RESET}`);
  console.log(`${AMBER}${BOLD}${centerText('B E T H')}${RESET}`);
  console.log(`${DIM}${WHITE}${centerText('AI Agent Orchestrator')}${RESET}`);
  console.log(`${GOLD}${BOLD}${centerText('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}${RESET}`);
}

async function displayQuote() {
  const quote = getRandomQuote();
  console.log();
  process.stdout.write(`${AMBER}    `);
  await typewriter(`"${quote}"`, 40);
  console.log(RESET);
}

/**
 * Quick banner - no portrait, just text
 */
export async function quickBanner() {
  console.log();
  console.log(`${GOLD}${BOLD}━━━ ${AMBER}BETH${GOLD} ━━━${RESET}`);
  console.log(`${DIM}${getRandomQuote()}${RESET}`);
  console.log();
}

/**
 * Full animation with portrait
 */
export async function fullAnimation() {
  hideCursor();
  
  try {
    clearScreen();
    await sleep(500);
    
    // Glitch intro
    await glitchEffect(5);
    
    // Show portrait
    clearScreen();
    const hasPortrait = await displayPortrait();
    
    if (hasPortrait) {
      await sleep(1000);
    }
    
    // Banner and quote
    displayBanner();
    await sleep(500);
    await displayQuote();
    
    console.log();
    console.log(`${DIM}${centerText('Press any key to continue...')}${RESET}`);
    
    // Wait for keypress
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });
      process.stdin.setRawMode(false);
    }
  } finally {
    showCursor();
  }
}

/**
 * Minimal startup text
 */
export function minimalBanner() {
  console.log(`${AMBER}${BOLD}Beth${RESET} ${DIM}| The bigger bear.${RESET}`);
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] || 'full';
  
  switch (mode) {
    case 'quick':
      quickBanner();
      break;
    case 'minimal':
      minimalBanner();
      break;
    case 'full':
    default:
      fullAnimation().catch(console.error);
  }
}
