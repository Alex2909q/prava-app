import * as pdfjs from './pdf_tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workerPath = path.resolve(__dirname, './pdf_tools/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

console.log('Loading database and page mapping...');

// 1. Load questions.js
const qjsContent = fs.readFileSync('questions.js', 'utf8');
let jsonStr = qjsContent.substring(qjsContent.indexOf('{')).replace(/;\s*$/, '');
const data = JSON.parse(jsonStr);

const allQuestions = [];
data.blocks.forEach(b => {
    b.questions.forEach(q => {
        // Remove existing image properties first
        delete q.image;
        
        allQuestions.push({
            id: q.id,
            q: q,
            normalized: q.question.replace(/[\s.,:;!?\(\)\-\"\'\«\»]/g, '').toLowerCase()
        });
    });
});

console.log(`Total questions in database: ${allQuestions.length}`);

// 2. Map questions to pages using pdf_text.txt
const pdfText = fs.readFileSync('pdf_text.txt', 'utf8');
const lines = pdfText.split('\n');
let currentPage = 1;
let questionStartPage = 1;
const pageQuestionsText = {};

let currentQText = '';
let inQuestion = false;

for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pageMatch = trimmed.match(/^--\s*(\d+)\s*of\s*\d+\s*--$/);
    if (pageMatch) {
        currentPage = parseInt(pageMatch[1], 10) + 1;
        continue;
    }
    if (/^\d+$/.test(trimmed)) continue;

    const startMatch = trimmed.match(/^(\d+)\.\s*(.*)$/);
    const hasLowercase = /[а-яіїєґa-z]/.test(trimmed);

    if (startMatch && hasLowercase) {
        if (inQuestion && currentQText) {
            const targetPage = questionStartPage || currentPage;
            if (!pageQuestionsText[targetPage]) pageQuestionsText[targetPage] = [];
            pageQuestionsText[targetPage].push(currentQText);
        }
        currentQText = startMatch[2];
        questionStartPage = currentPage;
        inQuestion = true;
    } else if (trimmed.match(/^\d+\)\s*(.*)$/)) {
        if (inQuestion && currentQText) {
            const targetPage = questionStartPage || currentPage;
            if (!pageQuestionsText[targetPage]) pageQuestionsText[targetPage] = [];
            pageQuestionsText[targetPage].push(currentQText);
            currentQText = '';
            inQuestion = false;
        }
    } else if (inQuestion) {
        currentQText += ' ' + trimmed;
    }
}
if (inQuestion && currentQText) {
    const targetPage = questionStartPage || currentPage;
    if (!pageQuestionsText[targetPage]) pageQuestionsText[targetPage] = [];
    pageQuestionsText[targetPage].push(currentQText);
}

const pageToQuestions = {};
allQuestions.forEach(q => {
    let foundPage = -1;
    for (let pageNum = 1; pageNum <= 539; pageNum++) {
        const pageQs = pageQuestionsText[pageNum] || [];
        const found = pageQs.some(pq => {
            const normPq = pq.replace(/[\s.,:;!?\(\)\-\"\'\«\»]/g, '').toLowerCase();
            return normPq.includes(q.normalized) || q.normalized.includes(normPq);
        });
        if (found) {
            foundPage = pageNum;
            break;
        }
    }
    if (foundPage !== -1) {
        if (!pageToQuestions[foundPage]) pageToQuestions[foundPage] = [];
        pageToQuestions[foundPage].push(q);
    }
});

console.log('Re-creating images directory...');
if (fs.existsSync('images')) {
    const files = fs.readdirSync('images');
    files.forEach(f => fs.unlinkSync(path.join('images', f)));
} else {
    fs.mkdirSync('images');
}

// 3. Load PDF
const pdfBuffer = fs.readFileSync('POLOTNO-NAKAZ_04_09_2025 (1).pdf');
const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: true }).promise;
console.log(`PDF Loaded. Total pages: ${doc.numPages}`);

let currentQuestion = null;
let savedImagesCount = 0;

function cleanText(items) {
  if (Array.isArray(items)) {
    return items.map(item => typeof item === 'string' ? item : (item.unicode || '')).join('');
  }
  return typeof items === 'string' ? items : '';
}

function findBestMatch(lineText, pageQuestions) {
    const cleanLine = lineText.replace(/^\d+\.\s*/, '');
    const normLine = cleanLine.replace(/[\s.,:;!?\(\)\-\"\'\«\»]/g, '').toLowerCase();
    if (normLine.length < 10) return null;
    
    let bestQ = null;
    let maxOverlap = 0;
    
    for (const q of pageQuestions) {
        const normQ = q.normalized;
        let overlap = 0;
        if (normQ.includes(normLine) || normLine.includes(normQ)) {
            overlap = Math.min(normQ.length, normLine.length);
        } else {
            const len = Math.min(normQ.length, normLine.length, 35);
            const prefixQ = normQ.substring(0, len);
            const prefixLine = normLine.substring(0, len);
            if (prefixQ === prefixLine) {
                overlap = len;
            }
        }
        if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestQ = q;
        }
    }
    
    if (maxOverlap > 12) {
        return bestQ;
    }
    return null;
}

for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    currentQuestion = null;
    const pageQs = pageToQuestions[pageNum] || [];
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const opList = await page.getOperatorList();
    
    const opMap = {};
    for (const [key, value] of Object.entries(pdfjs.OPS)) { opMap[value] = key; }
    
    const elements = textContent.items.map(item => ({
        type: 'text',
        text: item.str,
        x: item.transform[4],
        y: item.transform[5]
    })).filter(e => e.text.trim() !== '');
    
    let currentTransform = [1, 0, 0, 1, 0, 0];
    for (let i = 0; i < opList.fnArray.length; i++) {
        const fnId = opList.fnArray[i];
        const fnName = opMap[fnId];
        const args = opList.argsArray[i];
        
        if (fnName === 'transform') {
            currentTransform = args;
        } else if (fnName === 'paintImageXObject' || fnName === 'paintInlineImageXObject') {
            elements.push({
                type: 'image',
                name: args[0],
                x: currentTransform[4],
                y: currentTransform[5],
                w: currentTransform[0],
                h: currentTransform[3]
            });
        }
    }
    
    // Group text items by Y coordinate into lines
    const lines = [];
    elements.forEach(el => {
        if (el.type === 'image') {
            lines.push(el);
        } else {
            let found = false;
            for (let line of lines) {
                if (line.type === 'line' && Math.abs(line.y - el.y) < 4) {
                    line.items.push(el);
                    found = true;
                    break;
                }
            }
            if (!found) {
                lines.push({
                    type: 'line',
                    y: el.y,
                    items: [el]
                });
            }
        }
    });
    
    // Sort elements visually: Y descending
    lines.sort((a, b) => b.y - a.y);
    
    // Process layout from top to bottom
    for (let line of lines) {
        if (line.type === 'line') {
            line.items.sort((a, b) => a.x - b.x);
            const lineText = line.items.map(item => item.text).join(' ');
            
            // If the line starts like a question
            if (lineText.match(/^\s*\d+\.\s*/)) {
                const matchQ = findBestMatch(lineText, pageQs);
                if (matchQ) {
                    currentQuestion = matchQ;
                }
            }
        } else if (line.type === 'image') {
            if (currentQuestion) {
                const imgName = line.name;
                
                // Get the image object with retry loop for lazy resolution
                let imgObj = null;
                for (let attempt = 0; attempt < 30; attempt++) {
                    try {
                        imgObj = await page.objs.get(imgName);
                        if (imgObj && imgObj.data) break;
                    } catch (e) {
                        // Wait and retry for any error (typically transient resolution errors)
                        await new Promise(r => setTimeout(r, 100));
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
                
                if (imgObj && imgObj.data) {
                    const width = imgObj.width;
                    const height = imgObj.height;
                    
                    const png = new PNG({ width, height });
                    let srcPos = 0, destPos = 0;
                    
                    if (imgObj.data.length === width * height * 3) {
                        for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                                png.data[destPos++] = imgObj.data[srcPos++];
                                png.data[destPos++] = imgObj.data[srcPos++];
                                png.data[destPos++] = imgObj.data[srcPos++];
                                png.data[destPos++] = 255;
                            }
                        }
                    } else if (imgObj.data.length === width * height * 4) {
                        png.data.set(imgObj.data);
                    } else if (imgObj.data.length === width * height) {
                        for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                                const val = imgObj.data[srcPos++];
                                png.data[destPos++] = val;
                                png.data[destPos++] = val;
                                png.data[destPos++] = val;
                                png.data[destPos++] = 255;
                            }
                        }
                    } else {
                        console.log(`Page ${pageNum}: Unknown image format for ${imgName} (len: ${imgObj.data.length}, dim: ${width}x${height})`);
                        continue;
                    }
                    
                    const filename = `images/${currentQuestion.id}.png`;
                    
                    // Await the stream write to guarantee complete save
                    await new Promise((resolve, reject) => {
                        const stream = png.pack().pipe(fs.createWriteStream(filename));
                        stream.on('finish', resolve);
                        stream.on('error', reject);
                    });
                    
                    currentQuestion.q.image = filename;
                    savedImagesCount++;
                    
                    console.log(`Page ${pageNum.toString().padStart(3)} | Saved image for ${currentQuestion.id} ("${currentQuestion.q.question.substring(0, 50)}...")`);
                } else {
                    console.log(`Page ${pageNum}: Failed to resolve image ${imgName} for question ${currentQuestion.id}`);
                }
            } else {
                console.log(`Page ${pageNum}: Found image ${line.name} but no active question context.`);
            }
        }
    }
}

// 4. Save updated questions.js
const output = `// questions.js — База питань ПДР України
// Автоматично згенеровано з POLOTNO-NAKAZ_04_09_2025.pdf

const QUESTIONS_DATA = ${JSON.stringify(data, null, 2)};
`;
fs.writeFileSync('questions.js', output, 'utf8');

console.log(`\nSuccessfully processed all pages! Saved ${savedImagesCount} images and rebuilt questions.js.`);
