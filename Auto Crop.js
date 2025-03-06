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
    var createdAnnotations = []; // Store references to temporary annotations

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

            // Create problem object with position information for sorting
            var problem = {
                page: i,
                number: parseInt(currentStart.number, 10), // Convert to integer for numeric sorting
                text: problemWords.join(' '),
                lines: Array.from(problemLines).sort((a, b) => a - b),
                wordIndices: problemWordIndices,
                // Calculate approximate position for sorting (top-left to bottom-right)
                position: {
                    x: 0, // Will be updated in createAnnotation
                    y: 0  // Will be updated in createAnnotation
                }
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
    var problemsWithQuads = [];
    
    for (var i = 0; i < problems.length; i++) {
        var problem = problems[i];
        
        // Create a problem group header
        console.println("==== PROBLEM " + problem.number + " ====");
        console.println("Problem " + problem.number + ": " + problem.text);
        
        // Create annotation and get quad
        var result = createAnnotation(problem);
        if (result) {
            var annotRect = result.rect;
            var annotation = result.annotation;
            
            // Store annotation for later removal
            if (annotation) {
                createdAnnotations.push({
                    page: problem.page,
                    name: annotation.name
                });
            }
            
            var quad = [
                annotRect[0], annotRect[1],   // Left, Top (Point 1)
                annotRect[2], annotRect[1],   // Right, Top (Point 2)
                annotRect[0], annotRect[3],   // Left, Bottom (Point 3)
                annotRect[2], annotRect[3]    // Right, Bottom (Point 4)
            ];
            
            // Update problem position for sorting
            problem.position.x = annotRect[0];
            problem.position.y = annotRect[1];
            
            // Store problem with quad for later duplication
            problemsWithQuads.push({
                problem: problem,
                quad: quad
            });
            
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
    }
    
    // Sort problems for correct page placement order (by page, then by position from top-left to bottom-right)
    problemsWithQuads.sort(function(a, b) {
        // First sort by page number
        if (a.problem.page !== b.problem.page) {
            return a.problem.page - b.problem.page;
        }
        
        // Then by vertical position (top to bottom) - most important for reading order
        if (Math.abs(a.problem.position.y - b.problem.position.y) > 20) { // 20 points tolerance for same line
            return a.problem.position.y - b.problem.position.y;
        }
        
        // If on roughly the same line, sort by horizontal position (left to right)
        return a.problem.position.x - b.problem.position.x;
    });
    
    // After all problems have been processed and logged, perform the page duplication
    duplicateAndCropPages(problemsWithQuads, createdAnnotations);
    
    return problems;
}

function createAnnotation(problem) {
    var doc = this;
    var pageNum = problem.page;
    var allQuads = [];
    
    // Get page dimensions and rotation
    var pageBox = doc.getPageBox("CropBox", pageNum);
    var pageHeight = pageBox[1] - pageBox[3];
    var pageWidth = pageBox[2] - pageBox[0];
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
        
        try {
            // Generate a unique name for this annotation
            var annotName = "Problem_" + problem.number + "_" + Date.now();
            
            var annotation = doc.addAnnot({
                page: pageNum,
                type: "Square",
                rect: annotRect,
                name: annotName,
                contents: "Problem " + problem.number + ": " + problem.text,
                color: [1, 1, 0]
            });
            
            return {
                rect: annotRect,
                annotation: annotation
            };
        } catch (e) {
            console.println("Error creating annotation: " + e);
            // Still return the rectangle even if annotation creation failed
            return {
                rect: annotRect,
                annotation: null
            };
        }
    }
    
    return null;
}

function duplicateAndCropPages(problemsWithQuads, annotationList) {
    var doc = this;
    var originalNumPages = doc.numPages;
    
    if (!problemsWithQuads || problemsWithQuads.length === 0) {
        console.println("Error: No valid problems provided.");
        return;
    }

    console.println("Preparing to duplicate pages in reading order...");
    
    // Reverse the array to counteract the effect of always inserting at the end
    // This ensures the final order will be correct (first problem first)
    var reversedProblems = problemsWithQuads.slice().reverse();
    
    // Process duplication and cropping for all problems in reversed sorted order
    for (var i = 0; i < reversedProblems.length; i++) {
        var problem = reversedProblems[i].problem;
        var quad = reversedProblems[i].quad;
        var pageNum = problem.page;

        if (!quad || quad.length !== 8) {
            continue; // Skip invalid quad entries
        }
        
        // Insert the original page
        doc.insertPages({
            nPage: doc.numPages - 1, // Insert after the last page
            cPath: doc.path,
            nStart: pageNum,
            nEnd: pageNum
        });
        
        // Get the index of the newly inserted page (always the last page after insertion)
        var newPageIndex = doc.numPages - 1;
        
        // Remove all annotations from the newly inserted page
        cleanPageOfAnnotations(newPageIndex);

        // Calculate crop box coordinates
        var xMin = Math.min(quad[0], quad[2], quad[4], quad[6]);
        var xMax = Math.max(quad[0], quad[2], quad[4], quad[6]);
        var yMin = Math.min(quad[1], quad[3], quad[5], quad[7]);
        var yMax = Math.max(quad[1], quad[3], quad[5], quad[7]);
        
        // Apply crop box to the duplicated page
        doc.setPageBoxes({
            cBox: "Crop",
            nStart: newPageIndex,
            nEnd: newPageIndex,
            rBox: [xMin, yMin, xMax, yMax]
        });
        
        // Add a header to the cropped page with problem number
        addProblemHeader(newPageIndex, problem.number);
    }
    
    // Remove all annotations from the original pages
    removeAllAnnotationsFromDocument(annotationList);

    console.println("Duplication and cropping completed successfully.");
    console.println("Created " + problemsWithQuads.length + " problem-specific pages in reading order.");
}

function addProblemHeader(pageNum, problemNumber) {
    var doc = this;
    
    // Create header annotation at the top of the page
    var pageBox = doc.getPageBox("CropBox", pageNum);
    var width = pageBox[2] - pageBox[0];
    
    // Add problem number as a header at the top of the page
    var headerAnnot = doc.addAnnot({
        page: pageNum,
        type: "FreeText",
        rect: [5, pageBox[1] - 20, width - 5, pageBox[1] - 5],
        contents: "Problem " + problemNumber,
        intent: "FreeTextTypeWriter",
        alignment: 1, // Center alignment
        richContents: "<body><p align=\"center\"><b>Problem " + problemNumber + "</b></p></body>",
        rotate: 0,
        fillColor: [0.9, 0.9, 0.9], // Light gray background
        textColor: [0, 0, 0] // Black text
    });
}

function cleanPageOfAnnotations(pageNum) {
    var doc = this;
    try {
        // Get all annotations on the page
        var annots = doc.getAnnots({
            page: pageNum
        });
        
        // If no annotations found, return
        if (!annots || annots.length === 0) {
            return;
        }
        
        // Remove each annotation
        for (var i = annots.length - 1; i >= 0; i--) {
            try {
                annots[i].destroy();
            } catch (e) {
                console.println("Error removing annotation: " + e);
            }
        }
    } catch (e) {
        console.println("Error cleaning annotations from page " + pageNum + ": " + e);
    }
}

function removeAllAnnotationsFromDocument(annotationList) {
    var doc = this;
    
    console.println("Removing all temporary annotations from original pages...");
    
    try {
        // First try to remove annotations by their stored references
        if (annotationList && annotationList.length > 0) {
            for (var i = 0; i < annotationList.length; i++) {
                try {
                    var pageAnnots = doc.getAnnots({
                        page: annotationList[i].page,
                        name: annotationList[i].name
                    });
                    
                    if (pageAnnots && pageAnnots.length > 0) {
                        for (var j = 0; j < pageAnnots.length; j++) {
                            pageAnnots[j].destroy();
                        }
                    }
                } catch (e) {
                    console.println("Error removing specific annotation: " + e);
                }
            }
        }
        
        // As a backup, remove all Square annotations from original pages
        // This should catch any annotations that weren't properly removed above
        var numOriginalPages = doc.numPages - (annotationList ? annotationList.length : 0);
        
        for (var i = 0; i < numOriginalPages; i++) {
            var annots = doc.getAnnots({
                page: i,
                type: "Square"  // Only remove our square annotations
            });
            
            if (annots && annots.length > 0) {
                for (var j = 0; j < annots.length; j++) {
                    try {
                        annots[j].destroy();
                    } catch (e) {
                        console.println("Error removing annotation: " + e);
                    }
                }
            }
        }
        
        console.println("Annotations removed successfully.");
    } catch (e) {
        console.println("Error during annotation cleanup: " + e);
    }
}

// Main execution function with appropriate error handling
function main() {
    try {
        console.println("=== PDF Problem Extraction and Cropping Tool ===");
        console.println("Version: 1.1");
        console.println("Copyright (c) 2025 Breyonna Morgan");
        console.println("Starting document processing...\n");
        
        var problems = processDocument();
        
        if (problems && problems.length > 0) {
            console.println("\nProcessing complete!");
            console.println("Original document preserved with " + this.numPages + " total pages.");
            console.println("The first " + (this.numPages - problems.length) + " pages are the original document.");
            console.println("The last " + problems.length + " pages contain individual problems in reading order.");
        } else {
            console.println("\nProcessing complete, but no problems were found or processed.");
        }
    } catch (e) {
        console.println("ERROR: " + e.toString());
        console.println("Line: " + e.line);
        console.println("Please report this error to the developer.");
    }
}

// Execute the main function
main();
