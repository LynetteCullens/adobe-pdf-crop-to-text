/*
PDF Problem Extraction and Cropping Tool
https://blm.mit-license.org
Copyright (c) 2025 Breyonna Morgan
*/
function processDocument() {
    var doc = this;
    var numPages = doc.numPages;
    var problemRegex = /^(\d+)\.\s*$/;
    var problems = [];

    console.println("Scanning document for problems...");

    // Loop through each page
    for (var i = 0; i < numPages; i++) {
        var wordCount = doc.getPageNumWords(i);
        
        var wordDetails = [];
        var currentLineIndex = 1;
        var currentLineText = "";

        // Collect words with more context
        for (var w = 0; w < wordCount; w++) {
            var word = doc.getPageNthWord(i, w, false);
            
            // Detect line breaks and complex formatting
            if (word.includes('\n') || currentLineText.length > 100) {
                currentLineIndex++;
                currentLineText = "";
            }

            currentLineText += word + " ";

            wordDetails.push({
                word: word,
                lineIndex: currentLineIndex,
                originalIndex: w
            });
        }

        // Identify problem starts with stricter validation
        var problemStarts = [];
        for (var w = 0; w < wordDetails.length; w++) {
            var currentWord = wordDetails[w].word;
            problemRegex.lastIndex = 0;
            var match = problemRegex.exec(currentWord);
            
            if (match) {
                problemStarts.push({
                    index: w,
                    number: match[1],
                    lineIndex: wordDetails[w].lineIndex
                });
            }
        }

        // Build complete problems
        for (var psIndex = 0; psIndex < problemStarts.length; psIndex++) {
            var currentStart = problemStarts[psIndex];
            var nextStart = psIndex + 1 < problemStarts.length 
                ? problemStarts[psIndex + 1].index 
                : wordDetails.length;

            // Collect words for this problem
            var problemWords = [];
            var problemLines = new Set();
            var problemWordIndices = [];

            for (var w = currentStart.index; w < nextStart; w++) {
                var wordDetail = wordDetails[w];
                
                // Skip if this looks like a spurious problem start
                if (w !== currentStart.index && 
                    /^[0.]+$/.test(wordDetail.word.trim())) {
                    continue;
                }

                problemWords.push(wordDetail.word);
                problemLines.add(wordDetail.lineIndex);
                problemWordIndices.push(wordDetail.originalIndex);
            }

            // Create problem object
            var problem = {
                page: i,
                number: currentStart.number,
                text: problemWords.join(' '),
                lines: Array.from(problemLines).sort((a, b) => a - b),
                wordIndices: problemWordIndices
            };

            problems.push(problem);
        }
    }

    // If no problems are found, return
    if (problems.length === 0) {
        console.println("No problems found in the document.");
        return;
    }

    console.println("Found " + problems.length + " problems.");
    console.println("Processing each problem...");
    console.println("");

    // Process each problem completely (annotation, coordinates, and cropping) before moving to the next
    var allQuadsList = [];
    
    for (var i = 0; i < problems.length; i++) {
        var problem = problems[i];
        
        // Create a problem group header
        console.println("==== PROBLEM " + problem.number + " ====");
        console.println("Problem " + problem.number + ": " + problem.text);
        
        // Create annotation and get quad
        var annotRect = createAnnotation(problem);
        var quad = [
            annotRect[0], annotRect[1],   // Left, Top (Point 1)
            annotRect[2], annotRect[1],   // Right, Top (Point 2)
            annotRect[0], annotRect[3],   // Left, Bottom (Point 3)
            annotRect[2], annotRect[3]    // Right, Bottom (Point 4)
        ];
        
        // Store quad for later duplication
        allQuadsList.push([quad]);
        
        // Log rectangle coordinates
        console.println("Rectangle Coordinates:");
        console.println("    Left: " + annotRect[0]);
        console.println("    Right: " + annotRect[2]);
        console.println("    Top: " + annotRect[1]);
        console.println("    Bottom: " + annotRect[3]);
        
        // Get page dimensions for correction coordinates
        var pageBox = doc.getPageBox("CropBox", problem.page);
        var pageWidth = pageBox[2] - pageBox[0];
        var pageHeight = pageBox[1] - pageBox[3];
        
        // Calculate and log the correction coordinates
        // These would be the coordinates if we applied the Y-coordinate flipping
        console.println("Correction coordinates (if Y-flipping were applied):");
        console.println("    Left: " + annotRect[0]);
        console.println("    Right: " + annotRect[2]);
        console.println("    Top: " + (pageHeight - annotRect[3]));
        console.println("    Bottom: " + (pageHeight - annotRect[1]));
        
        // Calculate bounding box for cropping
        var xMin = Math.min(quad[0], quad[2], quad[4], quad[6]);
        var xMax = Math.max(quad[0], quad[2], quad[4], quad[6]);
        var yMin = Math.min(quad[1], quad[3], quad[5], quad[7]);
        var yMax = Math.max(quad[1], quad[3], quad[5], quad[7]);
        
        console.println("Bounding box: [" + xMin + ", " + yMin + ", " + xMax + ", " + yMax + "]");
        console.println(""); // Add blank line to separate problems
    }
    
    // After all problems have been processed and logged, perform the page duplication
    duplicateAndCropPages(allQuadsList);
    
    return problems;
}

function createAnnotation(problem) {
    var doc = this;
    var pageNum = problem.page;
    var allQuads = [];
    
    // Get page dimensions and rotation
    var pageBox = doc.getPageBox("CropBox", pageNum);
    var pageHeight = pageBox[1] - pageBox[3];
    var rotation = doc.getPageRotation(pageNum);
    
    for (var i = 0; i < problem.wordIndices.length; i++) {
        var wordIndex = problem.wordIndices[i];
        var wordQuads = doc.getPageNthWordQuads(pageNum, wordIndex, false);
        
        if (wordQuads) {
            for (var j = 0; j < wordQuads.length; j++) {
                var quad = wordQuads[j];
                allQuads.push(quad);
            }
        }
    }
    
    if (allQuads.length > 0) {
        // Calculate bounding rectangle from quads
        var xMin = Math.min.apply(null, allQuads.map(quad => Math.min(quad[0], quad[2], quad[4], quad[6])));
        var xMax = Math.max.apply(null, allQuads.map(quad => Math.max(quad[0], quad[2], quad[4], quad[6])));
        var yMin = Math.min.apply(null, allQuads.map(quad => Math.min(quad[1], quad[3], quad[5], quad[7])));
        var yMax = Math.max.apply(null, allQuads.map(quad => Math.max(quad[1], quad[3], quad[5], quad[7])));
        
        // Account for page rotation if needed
        var annotRect;
        if (rotation == 0) {
            annotRect = [xMin, yMin, xMax, yMax];
        } else if (rotation == 90) {
            annotRect = [yMin, pageWidth - xMax, yMax, pageWidth - xMin];
        } else if (rotation == 180) {
            annotRect = [pageWidth - xMax, pageHeight - yMax, pageWidth - xMin, pageHeight - yMin];
        } else if (rotation == 270) {
            annotRect = [pageHeight - yMax, xMin, pageHeight - yMin, xMax];
        } else {
            annotRect = [xMin, yMin, xMax, yMax]; // Default for no rotation
        }
        
        console.println("Creating annotation for Problem " + problem.number);
        
        var annotation = doc.addAnnot({
            page: pageNum,
            type: "Square",
            rect: annotRect,
            contents: "Problem " + problem.number + ": " + problem.text,
            color: [1, 1, 0]
        });
        
        return annotRect;
    }
    
    return null;
}

function duplicateAndCropPages(quadList) {
    var doc = this;
    var numPages = doc.numPages;

    if (!quadList || quadList.length === 0) {
        console.println("Error: No valid quads provided.");
        return;
    }

    console.println("Duplicating and cropping pages...");
    
    // Process duplication and cropping for all quads
    for (var pg = 0; pg < numPages; pg++) {
        for (var i = 0; i < quadList.length; i++) {
            var quad = quadList[i][0];

            if (!quad || quad.length !== 8) {
                continue; // Skip invalid quad entries
            }

            // Duplicate the page
            doc.insertPages({
                nPage: pg,
                cPath: doc.path,
                nStart: pg,
                nEnd: pg
            });

            // Apply crop to the duplicated page
            var xMin = Math.min(quad[0], quad[2], quad[4], quad[6]);
            var xMax = Math.max(quad[0], quad[2], quad[4], quad[6]);
            var yMin = Math.min(quad[1], quad[3], quad[5], quad[7]);
            var yMax = Math.max(quad[1], quad[3], quad[5], quad[7]);
            
            // Apply crop box to the duplicated page
            doc.setPageBoxes({
                cBox: "Crop",
                nStart: pg + numPages,
                nEnd: pg + numPages,
                rBox: [xMin, yMin, xMax, yMax]
            });
        }
    }

    console.println("Duplication and cropping completed successfully.");
}

// Execute the main function
processDocument();