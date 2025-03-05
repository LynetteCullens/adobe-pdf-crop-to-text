# adobe-pdf-crop-to-text
Find Problem Delimiter via Regex, Crop, and Save Each as New Page.

# PDF Problem Extraction and Cropping Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://blm.mit-license.org)

## Overview
This JavaScript tool for Adobe Acrobat automatically identifies numbered problems in a PDF document, creates bounding box annotations around each problem, and then generates individual cropped pages for each problem. It's particularly useful for textbooks, worksheets, or exam papers where you want to extract individual problems into separate pages.

## Features
- Automatically detects numbered problems (e.g., "1.", "2.", etc.)
- Creates visual annotations around each detected problem
- Generates individual cropped pages for each problem
- Maintains the original document intact
- Provides detailed console output for debugging and verification

## Installation
1. Open the JavaScript console in Adobe Acrobat (press Ctrl+J or Cmd+J)
2. Type `console.println(app.getPath("user", "javascript"))` to locate your JavaScript folder
3. Save the script file to this folder with a `.js` extension (e.g., `problem_extractor.js`)
4. Restart Adobe Acrobat

## Usage
1. Open the PDF document containing numbered problems
2. Open the JavaScript console (Ctrl+J or Cmd+J)
3. Run the script by typing: `processDocument();`
4. The script will:
   - Scan the document for numbered problems
   - Create yellow box annotations around each problem
   - Create duplicated pages with crops for each problem
   - Display detailed information in the console

## Console Output
The script provides detailed console output grouped by problem:
```
==== PROBLEM 1 ====
Problem 1: [Problem text]
Creating annotation for Problem 1
Rectangle Coordinates:
    Left: [value]
    Right: [value]
    Top: [value]
    Bottom: [value]
Correction coordinates (if Y-flipping were applied):
    Left: [value]
    Right: [value]
    Top: [value]
    Bottom: [value]
Bounding box: [xMin, yMin, xMax, yMax]
```

## How It Works
1. **Problem Detection**: The script scans each word in the document looking for patterns that match problem numbers (e.g., "1.", "2.", etc.)
2. **Word Collection**: For each problem, all words until the next problem number are collected
3. **Annotation Creation**: Bounding boxes are calculated around all words in each problem
4. **Page Duplication**: For each problem, the original page is duplicated
5. **Cropping**: Each duplicated page is cropped to show only the relevant problem

## Customization
- **Problem Number Format**: Modify the `problemRegex` to match different numbering formats
- **Annotation Color**: Change the `color` property in the `addAnnot` call to use different colors
- **Line Break Detection**: Adjust the line break detection logic if needed for different document formats

## Troubleshooting
- If problems aren't detected correctly, check the `problemRegex` pattern
- If crop boxes seem incorrectly positioned, verify the console output for rectangle coordinates
- For blank/empty pages, ensure the duplication and cropping logic is correctly targeting the right pages

## Requirements
- Adobe Acrobat Pro (not Adobe Reader)
- JavaScript support enabled in Acrobat

## Notes
- The script preserves the original document and adds new pages for each cropped problem
- The original pages remain at the beginning of the document
- Cropped problem pages are added after the original pages

## License
This project is licensed under the MIT License - see [https://blm.mit-license.org](https://blm.mit-license.org) for details.

Copyright (c) 2025 Breyonna Morgan
