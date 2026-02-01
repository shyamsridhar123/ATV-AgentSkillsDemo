#!/bin/bash
# Beth Animation - "I don't speak dipshit. I speak in consequences."

# Colors
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
AMBER="\033[38;2;218;165;32m"
GOLD="\033[38;2;255;215;0m"
WHITE="\033[38;2;255;255;255m"

# Clear screen and hide cursor
clear
tput civis

# Trap to restore cursor on exit
trap 'tput cnorm; echo -e "${RESET}"' EXIT

# Get terminal dimensions
COLS=$(tput cols)
LINES=$(tput lines)

# Path to ASCII art
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ART_FILE="${SCRIPT_DIR}/../assets/beth-portrait.txt"

# Beth's quotes
QUOTES=(
    "I don't speak dipshit. I speak in consequences."
    "They broke my wings and forgot I had claws."
    "I believe in lovin' with your whole soul and destroying anything that wants to kill what you love."
    "I'm the trailer park. I'm the tornado."
    "Where's the fun in breaking one thing? When I fix something, I fix it for generations."
    "I made two decisions based on fear and they cost me everything. I'll never make another."
    "You want my opinion? You're getting it either way."
)

# Function to center text
center_text() {
    local text="$1"
    local width=${#text}
    local padding=$(( (COLS - width) / 2 ))
    printf "%${padding}s%s\n" "" "$text"
}

# Function for typewriter effect
typewriter() {
    local text="$1"
    local delay="${2:-0.03}"
    for (( i=0; i<${#text}; i++ )); do
        printf "%s" "${text:$i:1}"
        sleep "$delay"
    done
    echo
}

# Function to display glitch frame
glitch_frame() {
    local lines_to_glitch=$((RANDOM % 3 + 1))
    for _ in $(seq 1 $lines_to_glitch); do
        local line=$((RANDOM % 20 + 5))
        tput cup $line 0
        echo -e "\033[38;2;$((RANDOM % 100));$((RANDOM % 50));$((RANDOM % 50))m$(head -c $((RANDOM % 40 + 10)) /dev/urandom | tr -dc '░▒▓█│┃┆┇┊┋')"
    done
    sleep 0.05
}

# Fade in effect - gradually reveal the image
fade_in() {
    if [[ ! -f "$ART_FILE" ]]; then
        echo "Art file not found: $ART_FILE"
        return 1
    fi
    
    local total_lines=$(wc -l < "$ART_FILE")
    
    # First pass: dim reveal
    echo -e "${DIM}"
    clear
    cat "$ART_FILE"
    sleep 0.3
    
    # Second pass: normal brightness with slight delay
    clear
    cat "$ART_FILE"
}

# Main animation sequence
main() {
    # Initial blackout with quote tease
    clear
    sleep 0.5
    
    # Glitch introduction
    for _ in {1..5}; do
        clear
        for _ in {1..10}; do
            local col=$((RANDOM % (COLS - 20)))
            local row=$((RANDOM % (LINES - 5) + 2))
            tput cup $row $col
            echo -e "\033[38;2;$((RANDOM % 150 + 100));$((RANDOM % 100 + 50));$((RANDOM % 50))m░▒▓█"
        done
        sleep 0.08
    done
    
    # Display the portrait
    clear
    if [[ -f "$ART_FILE" ]]; then
        cat "$ART_FILE"
    else
        echo "Portrait not found. Run from beth repository root."
    fi
    
    sleep 1
    
    # Add name below portrait
    echo
    echo -e "${GOLD}${BOLD}"
    center_text "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${RESET}"
    
    echo -e "${AMBER}${BOLD}"
    center_text "B E T H"
    echo -e "${RESET}"
    
    echo -e "${DIM}${WHITE}"
    center_text "AI Agent Orchestrator"
    echo -e "${RESET}"
    
    echo -e "${GOLD}${BOLD}"
    center_text "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${RESET}"
    
    sleep 0.5
    
    # Random quote with typewriter effect
    local quote="${QUOTES[$((RANDOM % ${#QUOTES[@]}))]}"
    echo
    echo -e "${AMBER}"
    printf "    "
    typewriter "\"${quote}\"" 0.04
    echo -e "${RESET}"
    
    echo
    echo -e "${DIM}"
    center_text "Press any key to continue..."
    echo -e "${RESET}"
    
    read -n 1 -s
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main
fi
