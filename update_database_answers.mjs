import fs from 'fs';

// Load questions.js
const content = fs.readFileSync('questions.js', 'utf-8');
const evalFunc = new Function('window', `
    ${content}
    return QUESTIONS_DATA;
`);
const data = evalFunc({});
const pdfAnswers = JSON.parse(fs.readFileSync('extracted_pdf_answers.json', 'utf-8'));

let changeCount = 0;

data.blocks.forEach((block, bIdx) => {
    const blockNumMatch = block.title.match(/^(\d+)\.\s+/);
    if (!blockNumMatch) return;
    const secNum = blockNumMatch[1];
    
    block.questions.forEach((q, idx) => {
        const qjsIdx = idx + 1;
        
        // 1. Handle special hardcoded cases first
        if (q.id === 'q_01_022') { // Block 1 Q23 (originally Q22 in array)
            const oldCorrect = q.answers.findIndex(a => a.correct) + 1;
            q.answers.forEach((ans, i) => ans.correct = (i === 2)); // Option 3 (Випередження) is correct
            console.log(`Special: Corrected Block 1 Q23 (${q.id}) correct answer index from ${oldCorrect} to 3 (Випередження).`);
            changeCount++;
            return;
        }
        if (q.id === 'q_09_423') { // Block 9 Q70
            const oldCorrect = q.answers.findIndex(a => a.correct) + 1;
            q.answers.forEach((ans, i) => ans.correct = (i === 2)); // Option 3 (0-indexed 2) is correct
            console.log(`Special: Corrected Block 9 Q70 (${q.id}) correct answer index from ${oldCorrect} to 3.`);
            changeCount++;
            return;
        }
        if (q.id === 'q_09_428') { // Block 9 Q75
            q.question = "Ви рухаєтесь на спуск з гірської дороги. З метою економії палива можна під час руху по цій дорозі вимкнути передачу?";
            q.answers = [
                { text: "Так.", correct: false },
                { text: "Ні.", correct: true }
            ];
            console.log(`Special: Split options and cleaned text for Block 9 Q75 (${q.id}). Option 2 (Ні) set to correct.`);
            changeCount++;
            return;
        }
        if (q.id === 'q_14_708') { // Block 14 Q131
            q.question = "Чи дозволено водію чорного автомобіля повернути праворуч у даному випадку?";
            q.answers = [
                { text: "Дозволено.", correct: true },
                { text: "Заборонено.", correct: false }
            ];
            console.log(`Special: Set correct text and options for Block 14 Q131 (${q.id}). Option 1 (Дозволено) set to correct.`);
            changeCount++;
            return;
        }
        if (q.id === 'q_14_709') { // Block 14 Q132 (empty question to skip)
            q.question = "";
            q.answers = [];
            console.log(`Special: Cleared empty Block 14 Q132 (${q.id}).`);
            changeCount++;
            return;
        }
        if (q.id === 'q_14_710') { // Block 14 Q133 (empty question to skip)
            q.question = "";
            q.answers = [];
            console.log(`Special: Cleared empty Block 14 Q133 (${q.id}).`);
            changeCount++;
            return;
        }
        if (q.id === 'q_43_1826') { // Block 43 Q16
            q.question = "Наведений індикатор червоного кольору інформує про:";
            q.answers = [
                { text: "Відчинені двері автомобіля.", correct: true },
                { text: "Блокування дверей автомобіля.", correct: false },
                { text: "Відчинені двері багажника.", correct: false }
            ];
            console.log(`Special: Restored options and cleaned text for Block 43 Q16 (${q.id}). Option 1 set to correct.`);
            changeCount++;
            return;
        }

        // 2. Perform general mapping
        let secName = `Розділ ${secNum}`;
        let pdfIdx = qjsIdx;
        let isMapped = true;
        
        if (block.id === 'block_01') {
            isMapped = false;
        } else if (block.id === 'block_07') {
            if (qjsIdx <= 8) {
                secName = 'Розділ 7';
                pdfIdx = qjsIdx;
            } else if (qjsIdx <= 62) {
                secName = 'Розділ 8.1';
                pdfIdx = qjsIdx - 8;
            } else if (qjsIdx <= 91) {
                secName = 'Розділ 8.1';
                pdfIdx = qjsIdx - 7; // shift + 1 due to merged question 55
            } else if (qjsIdx <= 98) {
                secName = 'Розділ 8.2';
                pdfIdx = qjsIdx - 91;
            } else {
                isMapped = false;
            }
        } else if (block.id === 'block_10') {
            if (qjsIdx <= 8) {
                pdfIdx = qjsIdx;
            } else {
                pdfIdx = qjsIdx + 1; // shift + 1 due to merged question 9
            }
        } else if (block.id === 'block_14') {
            if (qjsIdx <= 97) {
                secName = 'Розділ 15';
                pdfIdx = qjsIdx;
            } else if (qjsIdx <= 130) {
                secName = 'Розділ 16.1';
                pdfIdx = qjsIdx - 97;
            } else {
                secName = 'Розділ 16.2';
                pdfIdx = qjsIdx - 133;
            }
        } else if (block.id === 'block_50') {
            if (qjsIdx > 66) {
                isMapped = false; // Section 52 only has 66 questions in PDF
            }
        }
        
        if (isMapped) {
            const secAns = pdfAnswers[secName];
            if (secAns) {
                const pdfAns = secAns[pdfIdx];
                if (pdfAns !== undefined) {
                    // Update correct answer if within bounds
                    if (pdfAns <= q.answers.length && pdfAns > 0) {
                        const oldCorrect = q.answers.findIndex(a => a.correct) + 1;
                        if (oldCorrect !== pdfAns) {
                            q.answers.forEach((ans, i) => {
                                ans.correct = (i === (pdfAns - 1));
                            });
                            console.log(`Updated: Block ${bIdx + 1} (${block.id}) Q${qjsIdx} (${q.id}) correct answer index: ${oldCorrect} -> ${pdfAns} (mapped to ${secName} Q${pdfIdx})`);
                            changeCount++;
                        }
                    }
                }
            }
        }
    });
});

console.log(`\nApplied a total of ${changeCount} corrections.`);

// Save back to questions.js
const newContent = `const QUESTIONS_DATA = ${JSON.stringify(data, null, 2)};\n`;
fs.writeFileSync('questions.js', newContent, 'utf-8');
console.log('Successfully wrote updated questions to questions.js');
