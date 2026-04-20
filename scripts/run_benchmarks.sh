#!/bin/bash
set -e

echo "=== Vela Exchange Benchmark Suite ==="
echo "Running on: $(uname -m) $(sysctl -n machdep.cpu.brand_string 2>/dev/null || grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
echo "Date: $(date)"
echo ""

cd "$(dirname "$0")/.."
cargo bench --bench matching_engine_bench 2>&1 | tee benchmark_results.txt

echo ""
echo "Results saved to benchmark_results.txt"
echo "HTML report: engine/target/criterion/report/index.html"
