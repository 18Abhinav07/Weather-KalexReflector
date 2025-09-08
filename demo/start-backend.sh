#!/bin/bash

echo "🚀 Starting KALE Weather Farming Backend Server"
echo "============================================="
echo ""
echo "📊 Configuration:"
echo "  - Port: 4000"
echo "  - Block Duration: 15 seconds"
echo "  - Total Cycle: 10 blocks (2.5 minutes)"
echo "  - API Base: http://localhost:4000/api/"
echo ""
echo "🎯 Game Phases:"
echo "  - Blocks 1-5: Wager + Agriculture (Plant/Store) phase"
echo "  - Block 6:    Location reveal + Agriculture only"
echo "  - Blocks 7-9: Agriculture only (Plant/Store)"
echo "  - Block 10:   Weather reveal + Final settlement"
echo ""

cd "$(dirname "$0")"

# Start backend with enhanced logging
echo "🔧 Initializing backend server..."
bun run backend-enhanced.ts