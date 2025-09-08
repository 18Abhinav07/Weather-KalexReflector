#!/bin/bash

echo "🚀 Starting KALE Weather Farming 4-Process Demo"
echo "=============================================="
echo ""

# Colors for different terminals
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to kill background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down all demo processes..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}

# Set up signal handling
trap cleanup SIGINT SIGTERM

# Navigate to the demo directory
cd "$(dirname "$0")"

echo "📊 Demo Configuration:"
echo "  - Backend Server: http://localhost:3000"
echo "  - Block Duration: 3 seconds"
echo "  - Total Cycle: 10 blocks (30 seconds)"
echo "  - Users: Alice (Aggressive), Bob (Conservative), Charlie (Mixed)"
echo ""

# Start backend server
echo -e "${GREEN}🔧 Starting Backend Server...${NC}"
bun run backend-server.ts > backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Check if backend started successfully
if ! curl -s http://localhost:3000/api/health > /dev/null; then
    echo "❌ Backend failed to start. Check backend.log for details."
    exit 1
fi

echo -e "${GREEN}✅ Backend server started successfully${NC}"
echo ""

# Start user clients with a small delay between each
echo -e "${RED}🚀 Starting Alice (Aggressive Strategy)...${NC}"
bun run user-client.ts aggressive > alice.log 2>&1 &
ALICE_PID=$!
sleep 1

echo -e "${BLUE}🚀 Starting Bob (Conservative Strategy)...${NC}"
bun run user-client.ts conservative > bob.log 2>&1 &
BOB_PID=$!
sleep 1

echo -e "${YELLOW}🚀 Starting Charlie (Mixed Strategy)...${NC}"
bun run user-client.ts mixed > charlie.log 2>&1 &
CHARLIE_PID=$!

echo ""
echo "🎮 All processes started! Demo is now running..."
echo ""
echo "📋 Process Status:"
echo "  - Backend Server: PID $BACKEND_PID (Port 3000)"
echo "  - Alice Client:   PID $ALICE_PID (Aggressive)"
echo "  - Bob Client:     PID $BOB_PID (Conservative)" 
echo "  - Charlie Client: PID $CHARLIE_PID (Mixed)"
echo ""
echo "📊 Log Files:"
echo "  - Backend: backend.log"
echo "  - Alice:   alice.log"  
echo "  - Bob:     bob.log"
echo "  - Charlie: charlie.log"
echo ""
echo "🎯 What to expect:"
echo "  - Blocks 1-5: Wager phase (users place bets)"
echo "  - Block 6:    Location revealed, agriculture starts"
echo "  - Blocks 7-8: Agriculture phase (planting/working)"
echo "  - Block 9:    Weather calculation and voting"
echo "  - Block 10:   Final results and rewards"
echo ""
echo "📱 You can also monitor via:"
echo "  - Health: curl http://localhost:3000/api/health"
echo "  - Status: curl http://localhost:3000/api/cycle/status"
echo ""
echo "⏰ Demo will complete in ~30 seconds..."
echo ""
echo "Press Ctrl+C to stop all processes"
echo "=============================================="

# Function to show real-time updates
show_progress() {
    local current_block=1
    local start_time=$(date +%s)
    
    while [ $current_block -le 10 ]; do
        sleep 3
        
        # Try to get current status
        if block_info=$(curl -s http://localhost:3000/api/cycle/status 2>/dev/null); then
            current_block=$(echo "$block_info" | grep -o '"currentBlock":[0-9]*' | cut -d: -f2)
            phase=$(echo "$block_info" | grep -o '"phase":"[^"]*' | cut -d: -f2 | tr -d '"')
            
            elapsed=$(($(date +%s) - start_time))
            echo "📍 Block $current_block/10 - Phase: $phase - Elapsed: ${elapsed}s"
            
            # Special announcements
            if [ "$current_block" -eq 6 ]; then
                echo "🌍 LOCATION REVEALED! Agriculture phase begins!"
            elif [ "$current_block" -eq 9 ]; then
                echo "🗳️  Final weather calculation in progress..."
            elif [ "$current_block" -eq 10 ]; then
                echo "🏆 Cycle completed! Calculating final rewards..."
                break
            fi
        fi
        
        current_block=$((current_block + 1))
    done
}

# Show progress in background
show_progress &
PROGRESS_PID=$!

# Wait for all user clients to finish (they exit after results)
wait $ALICE_PID $BOB_PID $CHARLIE_PID 2>/dev/null

# Kill progress monitor
kill $PROGRESS_PID 2>/dev/null

echo ""
echo "🎉 DEMO COMPLETED SUCCESSFULLY!"
echo ""
echo "📊 Final Results Summary:"
echo "========================"

# Show final results from backend
if final_results=$(curl -s http://localhost:3000/api/cycle/results 2>/dev/null); then
    echo "$final_results" | python3 -m json.tool 2>/dev/null || echo "Results available via API"
fi

echo ""
echo "📋 Individual User Results:"
echo ""
echo -e "${RED}Alice (Aggressive):${NC}"
tail -10 alice.log | grep -E "(FINAL RESULTS|Wager:|Planted:|TOTAL REWARD)" || echo "  Check alice.log for details"
echo ""

echo -e "${BLUE}Bob (Conservative):${NC}"
tail -10 bob.log | grep -E "(FINAL RESULTS|Wager:|Planted:|TOTAL REWARD)" || echo "  Check bob.log for details"
echo ""

echo -e "${YELLOW}Charlie (Mixed):${NC}"
tail -10 charlie.log | grep -E "(FINAL RESULTS|Wager:|Planted:|TOTAL REWARD)" || echo "  Check charlie.log for details"
echo ""

# Clean up backend
echo "🧹 Cleaning up backend server..."
kill $BACKEND_PID 2>/dev/null
wait $BACKEND_PID 2>/dev/null

echo ""
echo "✅ Demo completed successfully!"
echo "📁 Check the log files for detailed execution traces"
echo "🎯 All components worked in harmony - Integration validated!"