/**
 * Image Hash Utility
 *
 * Provides functions for comparing images using perceptual hashing.
 * The hash is generated client-side and compared server-side.
 */

/**
 * Calculate Hamming distance between two hex hashes
 * @param {string} hash1 - First hash (hex string)
 * @param {string} hash2 - Second hash (hex string)
 * @returns {number} - Hamming distance
 */
function hammingDistance(hash1, hash2) {
    if (!hash1 || !hash2) {
        return Infinity;
    }

    // Ensure both hashes have the same length
    const len = Math.max(hash1.length, hash2.length);
    const h1 = hash1.padStart(len, '0');
    const h2 = hash2.padStart(len, '0');

    let distance = 0;

    for (let i = 0; i < len; i++) {
        const n1 = parseInt(h1[i], 16);
        const n2 = parseInt(h2[i], 16);

        // XOR the values and count the set bits
        let xor = n1 ^ n2;
        while (xor) {
            distance += xor & 1;
            xor >>= 1;
        }
    }

    return distance;
}

/**
 * Calculate similarity between two hashes
 * @param {string} hash1 - First hash (hex string)
 * @param {string} hash2 - Second hash (hex string)
 * @param {number} hashBits - Number of bits in the hash (default 64 for 8x8 pHash)
 * @returns {number} - Similarity score (0 to 1)
 */
function calculateSimilarity(hash1, hash2, hashBits = 64) {
    if (!hash1 || !hash2) {
        return 0;
    }

    const distance = hammingDistance(hash1, hash2);
    const similarity = 1 - (distance / hashBits);

    return Math.max(0, Math.min(1, similarity));
}

/**
 * Check if two hashes are similar enough
 * @param {string} hash1 - First hash
 * @param {string} hash2 - Second hash
 * @param {number} threshold - Minimum similarity threshold (default 0.7)
 * @returns {boolean} - Whether the images are similar enough
 */
function isSimilar(hash1, hash2, threshold = 0.7) {
    return calculateSimilarity(hash1, hash2) >= threshold;
}

/**
 * Find the best matching page for an uploaded image
 * @param {string} imageHash - Hash of the uploaded image
 * @param {Array} pages - Array of page objects with pHash property
 * @param {number} threshold - Minimum similarity threshold (default 0.7)
 * @returns {Object|null} - Best matching page or null if no match
 */
function findBestMatch(imageHash, pages, threshold = 0.7) {
    if (!imageHash || !pages || pages.length === 0) {
        return null;
    }

    let bestMatch = null;
    let bestSimilarity = 0;

    for (const page of pages) {
        if (!page.pHash) continue;

        const similarity = calculateSimilarity(imageHash, page.pHash);

        if (similarity > bestSimilarity && similarity >= threshold) {
            bestSimilarity = similarity;
            bestMatch = {
                pageNumber: page.pageNumber,
                similarity,
                passed: true
            };
        }
    }

    return bestMatch;
}

/**
 * Match multiple images to pages (sequential + pHash hybrid approach)
 * @param {Array} imageHashes - Array of { hash, originalIndex } objects
 * @param {Array} pages - Array of page objects with pHash property
 * @param {number} threshold - Minimum similarity threshold (default 0.7)
 * @param {Object} options - Optional settings { useSequential: true, startPage: 1 }
 * @returns {Array} - Array of match results
 */
function matchImagesToPages(imageHashes, pages, threshold = 0.7, options = {}) {
    if (!imageHashes || !pages) {
        return [];
    }

    const { useSequential = true, startPage = 1 } = options;
    const results = [];
    const matchedPages = new Set();

    // Sort pages by page number
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

    // Get available pages (not yet submitted, >= startPage)
    const availablePages = sortedPages.filter(p => p.pageNumber >= startPage);

    if (useSequential && availablePages.length > 0) {
        // Sequential matching: match images in order to available pages in order
        for (let i = 0; i < imageHashes.length; i++) {
            const img = imageHashes[i];

            // Find next available unmatched page
            let matchedPage = null;
            for (const page of availablePages) {
                if (matchedPages.has(page.pageNumber)) continue;

                // Use pHash similarity as validation (with lower threshold for sequential)
                const similarity = page.pHash ? calculateSimilarity(img.hash, page.pHash) : 0;
                const sequentialThreshold = 0.5; // Lower threshold for sequential matching

                // Accept the match if similarity is above sequential threshold
                // or if we don't have a pHash (trust sequential order)
                if (!page.pHash || similarity >= sequentialThreshold) {
                    matchedPage = {
                        pageNumber: page.pageNumber,
                        similarity: similarity || 1.0,
                        passed: true
                    };
                    matchedPages.add(page.pageNumber);
                    break;
                }
            }

            if (matchedPage) {
                results.push({
                    originalIndex: img.originalIndex !== undefined ? img.originalIndex : i,
                    ...matchedPage
                });
            } else {
                // No sequential match, try to find best pHash match from remaining pages
                const fallbackMatch = findBestMatchFromRemaining(img, pages, matchedPages, threshold);
                if (fallbackMatch) {
                    matchedPages.add(fallbackMatch.pageNumber);
                    results.push({
                        originalIndex: img.originalIndex !== undefined ? img.originalIndex : i,
                        ...fallbackMatch
                    });
                } else {
                    results.push({
                        originalIndex: img.originalIndex !== undefined ? img.originalIndex : i,
                        pageNumber: null,
                        similarity: 0,
                        passed: false
                    });
                }
            }
        }
    } else {
        // Original pHash-based matching (fallback)
        const imageMatchScores = imageHashes.map((img, idx) => {
            let bestScore = 0;
            let bestPage = null;

            for (const page of pages) {
                if (!page.pHash) continue;
                const similarity = calculateSimilarity(img.hash, page.pHash);
                if (similarity > bestScore) {
                    bestScore = similarity;
                    bestPage = page.pageNumber;
                }
            }

            return { ...img, originalIndex: idx, bestScore, bestPage };
        });

        imageMatchScores.sort((a, b) => b.bestScore - a.bestScore);

        for (const img of imageMatchScores) {
            let bestMatch = null;
            let bestSimilarity = 0;

            for (const page of pages) {
                if (!page.pHash || matchedPages.has(page.pageNumber)) continue;

                const similarity = calculateSimilarity(img.hash, page.pHash);

                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    if (similarity >= threshold) {
                        bestMatch = {
                            pageNumber: page.pageNumber,
                            similarity,
                            passed: true
                        };
                    }
                }
            }

            if (bestMatch) {
                matchedPages.add(bestMatch.pageNumber);
                results.push({
                    originalIndex: img.originalIndex,
                    ...bestMatch
                });
            } else {
                results.push({
                    originalIndex: img.originalIndex,
                    pageNumber: null,
                    similarity: bestSimilarity,
                    passed: false
                });
            }
        }
    }

    // Sort by original index to maintain order
    results.sort((a, b) => a.originalIndex - b.originalIndex);

    return results;
}

/**
 * Helper function to find best match from remaining unmatched pages
 */
function findBestMatchFromRemaining(img, pages, matchedPages, threshold) {
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const page of pages) {
        if (!page.pHash || matchedPages.has(page.pageNumber)) continue;

        const similarity = calculateSimilarity(img.hash, page.pHash);

        if (similarity > bestSimilarity && similarity >= threshold) {
            bestSimilarity = similarity;
            bestMatch = {
                pageNumber: page.pageNumber,
                similarity,
                passed: true
            };
        }
    }

    return bestMatch;
}

// Similarity threshold constant
const SIMILARITY_THRESHOLD = 0.7;

module.exports = {
    hammingDistance,
    calculateSimilarity,
    isSimilar,
    findBestMatch,
    matchImagesToPages,
    SIMILARITY_THRESHOLD
};
