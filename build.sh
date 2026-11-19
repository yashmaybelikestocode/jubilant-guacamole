#!/bin/sh
# Builds dist/attendance-calculator.zip containing an "attendance-calculator" folder ready for "Load unpacked".
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/attendance-calculator
cp -R extension/. dist/attendance-calculator/
find dist -name .DS_Store -delete
(cd dist && zip -qr -X attendance-calculator.zip attendance-calculator)
rm -rf dist/attendance-calculator
echo "Built dist/attendance-calculator.zip"
