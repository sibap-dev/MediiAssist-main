
        const CONDITIONS_DB = [
            {
                name: 'Fever',
                iconClass: 'fas fa-temperature-high',
                description: 'Elevated temperature generally caused by infection or inflammation.',
                severity: 55,
                severityText: 'Moderate',
                keywords: ['fever', 'high temperature', 'chills', 'sweating', 'body ache', 'shivering', 'hot skin'],
                remedies: [
                    { title: 'Ginger and honey tea', desc: 'Drink warm ginger tea 2-3 times daily.' },
                    { title: 'Hydration', desc: 'Take water, ORS, or clear soups throughout the day.' },
                    { title: 'Cold compress', desc: 'Apply a cool cloth to forehead and wrists.' }
                ],
                activities: [
                    { title: 'Complete bed rest' },
                    { title: 'Stay in a cool room' },
                    { title: 'Avoid heavy food' }
                ],
                warnings: [
                    'Fever above 103 F requires urgent medical care.',
                    'Fever lasting more than 3 days should be evaluated.',
                    'Fever with severe headache or stiff neck needs immediate review.'
                ]
            },
            {
                name: 'Common Cold',
                iconClass: 'fas fa-head-side-cough',
                description: 'A mild viral respiratory infection with nasal and throat symptoms.',
                severity: 30,
                severityText: 'Mild',
                keywords: ['runny nose', 'sneezing', 'sore throat', 'congestion', 'stuffy nose', 'mild cough'],
                remedies: [
                    { title: 'Steam inhalation', desc: 'Use steam for 10 minutes, 2-3 times daily.' },
                    { title: 'Saltwater gargle', desc: 'Gargle with warm saltwater to soothe throat.' },
                    { title: 'Vitamin C rich foods', desc: 'Use citrus fruits and warm fluids.' }
                ],
                activities: [
                    { title: 'Sleep for 8 hours or more' },
                    { title: 'Keep room ventilated' },
                    { title: 'Practice hand hygiene' }
                ],
                warnings: [
                    'Symptoms beyond 10 days may require consultation.',
                    'High fever with cold symptoms needs clinical check.',
                    'Breathing difficulty should be treated as urgent.'
                ]
            },
            {
                name: 'Headache',
                iconClass: 'fas fa-head-side-virus',
                description: 'Head pain often linked to stress, dehydration, or migraine triggers.',
                severity: 40,
                severityText: 'Moderate',
                keywords: ['headache', 'head pain', 'migraine', 'throbbing', 'head pressure', 'dizziness'],
                remedies: [
                    { title: 'Hydrate immediately', desc: 'Drink 2-3 glasses of water.' },
                    { title: 'Cold or warm compress', desc: 'Cold for migraine, warm for tension pain.' },
                    { title: 'Limit screen strain', desc: 'Rest eyes in a dim environment.' }
                ],
                activities: [
                    { title: 'Rest in a quiet room' },
                    { title: 'Try gentle neck stretches' },
                    { title: 'Reduce screen exposure' }
                ],
                warnings: [
                    'Sudden severe headache requires emergency care.',
                    'Headache after injury needs urgent evaluation.',
                    'Persistent severe pain despite rest should be reviewed.'
                ]
            },
            {
                name: 'Stomach Upset',
                iconClass: 'fas fa-stomach',
                description: 'Digestive discomfort such as nausea, gas, acidity, or bloating.',
                severity: 35,
                severityText: 'Mild to Moderate',
                keywords: ['stomach pain', 'nausea', 'vomiting', 'bloating', 'indigestion', 'gas', 'acidity'],
                remedies: [
                    { title: 'Cumin seed water', desc: 'Warm jeera water helps gas and fullness.' },
                    { title: 'Bland food', desc: 'Choose light meals like banana and rice.' },
                    { title: 'Coconut water', desc: 'Maintains hydration and comfort.' }
                ],
                activities: [
                    { title: 'Take a short gentle walk' },
                    { title: 'Avoid spicy and oily meals' },
                    { title: 'Stay upright after meals' }
                ],
                warnings: [
                    'Severe abdominal pain for over 2 hours needs medical review.',
                    'Blood in stool or vomit is an emergency sign.',
                    'Persistent vomiting may cause dehydration and needs care.'
                ]
            },
            {
                name: 'Cough',
                iconClass: 'fas fa-lungs-virus',
                description: 'Dry or productive cough due to irritation, allergy, or infection.',
                severity: 35,
                severityText: 'Mild',
                keywords: ['cough', 'dry cough', 'wet cough', 'chest congestion', 'mucus', 'wheezing'],
                remedies: [
                    { title: 'Honey and ginger', desc: 'Use in small doses several times daily.' },
                    { title: 'Steam inhalation', desc: 'Helps loosen mucus and congestion.' },
                    { title: 'Warm turmeric milk', desc: 'Soothes irritated throat and chest.' }
                ],
                activities: [
                    { title: 'Rest and sleep well' },
                    { title: 'Avoid cold beverages' },
                    { title: 'Cover mouth while coughing' }
                ],
                warnings: [
                    'Cough lasting more than 3 weeks should be assessed.',
                    'Coughing blood requires immediate emergency care.',
                    'Cough with breathing difficulty is urgent.'
                ]
            },
            {
                name: 'Body Pain and Fatigue',
                iconClass: 'fas fa-bed',
                description: 'Generalized aches and tiredness from illness, stress, or overexertion.',
                severity: 40,
                severityText: 'Moderate',
                keywords: ['body ache', 'muscle pain', 'fatigue', 'tiredness', 'weakness', 'joint pain'],
                remedies: [
                    { title: 'Warm bath', desc: 'Helps relax sore muscles.' },
                    { title: 'Balanced hydration and meals', desc: 'Support recovery with fluids and nutrition.' },
                    { title: 'Light stretching', desc: 'Reduce stiffness without overexertion.' }
                ],
                activities: [
                    { title: 'Sleep 8 to 10 hours' },
                    { title: 'Avoid intensive workouts' },
                    { title: 'Gentle mobility only' }
                ],
                warnings: [
                    'Extreme weakness with shortness of breath needs urgent care.',
                    'Persistent pain over one week needs evaluation.',
                    'Chest pain with body pain is an emergency.'
                ]
            },
            {
                name: 'Diarrhea',
                iconClass: 'fas fa-prescription-bottle-medical',
                description: 'Frequent loose stools often linked to infection or food intolerance.',
                severity: 50,
                severityText: 'Moderate',
                keywords: ['diarrhea', 'loose motions', 'loose stools', 'watery stools', 'food poisoning'],
                remedies: [
                    { title: 'ORS solution', desc: 'Drink after every loose motion.' },
                    { title: 'BRAT diet', desc: 'Banana, rice, applesauce, toast.' },
                    { title: 'Probiotic foods', desc: 'Curd may help gut recovery.' }
                ],
                activities: [
                    { title: 'Strict rest and hydration' },
                    { title: 'Avoid spicy and dairy-heavy meals' },
                    { title: 'Keep strict hand hygiene' }
                ],
                warnings: [
                    'More than 6 episodes in 24 hours requires review.',
                    'Blood in stools is urgent.',
                    'Dehydration signs need immediate medical attention.'
                ]
            },
            {
                name: 'Cold and Flu',
                iconClass: 'fas fa-virus',
                description: 'Flu-like syndrome with fever, cough, weakness, and body aches.',
                severity: 60,
                severityText: 'Moderate to High',
                keywords: ['flu', 'influenza', 'cold and fever', 'body ache and fever', 'chills and cough'],
                remedies: [
                    { title: 'Warm herbal decoction', desc: 'Use ginger, basil, cinnamon in warm water.' },
                    { title: 'Hydration every 30 minutes', desc: 'Use soups and warm fluids often.' },
                    { title: 'Temperature monitoring', desc: 'Track fever and symptom progression.' }
                ],
                activities: [
                    { title: 'Complete bed rest' },
                    { title: 'Avoid crowded spaces' },
                    { title: 'Wear a mask if around others' }
                ],
                warnings: [
                    'Breathing difficulty needs emergency attention.',
                    'Chest pain or confusion is urgent.',
                    'Symptoms returning with high fever should be reviewed quickly.'
                ]
            }
        ];

        const DISPLAY_SYMPTOMS = [
            'fever', 'chills', 'headache', 'body ache', 'runny nose', 'sneezing',
            'sore throat', 'cough', 'dry cough', 'nausea', 'vomiting', 'bloating',
            'diarrhea', 'fatigue', 'weakness', 'dizziness', 'sweating', 'joint pain',
            'chest congestion', 'congestion', 'muscle pain', 'shivering', 'acidity', 'flu'
        ];

        let selectedSymptoms = [];
        let detectedSymptoms = new Set();

        function showToast(message) {
            const t = document.getElementById('toast');
            t.textContent = message;
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2200);
        }

        function handleSymptomInput() {
            const input = document.getElementById('symptomInput').value.toLowerCase();
            const detectedSection = document.getElementById('detectedSymptomsSection');
            
            if (input.trim().length === 0) {
                detectedSection.style.display = 'none';
                detectedSymptoms.clear();
                selectedSymptoms = selectedSymptoms.filter(s => !Array.from(detectedSymptoms).includes(s));
                renderChips();
                updateCheckButton();
                return;
            }

            detectedSection.style.display = 'block';
            detectedSymptoms.clear();

            DISPLAY_SYMPTOMS.forEach(symptom => {
                const symptomWords = symptom.split(' ');
                const inputWords = input.split(/\s+/);
                
                const hasMatch = symptomWords.some(sw => 
                    inputWords.some(iw => 
                        iw.includes(sw) || sw.includes(iw) || 
                        levenshteinDistance(iw, sw) <= 2
                    )
                );

                if (hasMatch || input.includes(symptom) || symptom.includes(input.trim())) {
                    detectedSymptoms.add(symptom);
                }
            });

            CONDITIONS_DB.forEach(condition => {
                condition.keywords.forEach(keyword => {
                    const keywordWords = keyword.toLowerCase().split(' ');
                    const inputWords = input.split(/\s+/);
                    
                    const hasMatch = keywordWords.some(kw => 
                        inputWords.some(iw => 
                            iw.includes(kw) || kw.includes(iw) ||
                            levenshteinDistance(iw, kw) <= 2
                        )
                    );

                    if (hasMatch || input.includes(keyword.toLowerCase())) {
                        const matchingSymptom = DISPLAY_SYMPTOMS.find(s => 
                            keyword.toLowerCase().includes(s) || s.includes(keyword.toLowerCase())
                        );
                        if (matchingSymptom) {
                            detectedSymptoms.add(matchingSymptom);
                        }
                    }
                });
            });

            selectedSymptoms = Array.from(new Set([...selectedSymptoms, ...Array.from(detectedSymptoms)]));
            
            document.querySelectorAll('.quick-btn').forEach(btn => {
                const symptom = btn.getAttribute('data-symptom');
                if (detectedSymptoms.has(symptom)) {
                    btn.classList.add('selected');
                }
            });

            renderChips();
            updateCheckButton();
        }

        function levenshteinDistance(str1, str2) {
            if (str1.length < 3 || str2.length < 3) return 999;
            
            const matrix = [];
            for (let i = 0; i <= str2.length; i++) {
                matrix[i] = [i];
            }
            for (let j = 0; j <= str1.length; j++) {
                matrix[0][j] = j;
            }
            for (let i = 1; i <= str2.length; i++) {
                for (let j = 1; j <= str1.length; j++) {
                    if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(
                            matrix[i - 1][j - 1] + 1,
                            matrix[i][j - 1] + 1,
                            matrix[i - 1][j] + 1
                        );
                    }
                }
            }
            return matrix[str2.length][str1.length];
        }

        function updateCheckButton() {
            const inputText = document.getElementById('symptomInput').value.trim();
            const hasInput = inputText.length > 0 || selectedSymptoms.length > 0;
            document.getElementById('checkHealthBtn').disabled = !hasInput;
        }

        function renderSymptomButtons() {
            const grid = document.getElementById('quickSymptomsGrid');
            grid.innerHTML = DISPLAY_SYMPTOMS.map(s =>
                '<button class="quick-btn" data-symptom="' + s + '" onclick="toggleSymptomChip(\'' + s + '\', this)">' +
                s.charAt(0).toUpperCase() + s.slice(1) +
                '</button>'
            ).join('');
        }

        function toggleSymptomChip(symptom, button) {
            const i = selectedSymptoms.indexOf(symptom);
            if (i === -1) {
                selectedSymptoms.push(symptom);
                button.classList.add('selected');
            } else {
                selectedSymptoms.splice(i, 1);
                button.classList.remove('selected');
            }
            renderChips();
            updateCheckButton();
        }

        function removeSymptom(symptom) {
            selectedSymptoms = selectedSymptoms.filter(s => s !== symptom);
            detectedSymptoms.delete(symptom);
            const btn = document.querySelector('[data-symptom="' + symptom + '"]');
            if (btn) btn.classList.remove('selected');
            renderChips();
            updateCheckButton();
        }

        function renderChips() {
            const container = document.getElementById('symptomChipsContainer');
            const placeholder = document.getElementById('chipPlaceholder');
            Array.from(container.querySelectorAll('.chip')).forEach(el => el.remove());

            if (selectedSymptoms.length === 0) {
                placeholder.style.display = '';
                return;
            }

            placeholder.style.display = 'none';
            selectedSymptoms.forEach(symptom => {
                const chip = document.createElement('span');
                chip.className = 'chip';
                chip.innerHTML = symptom + ' <button onclick="removeSymptom(\'' + symptom + '\')"><i class="fas fa-times"></i></button>';
                container.appendChild(chip);
            });
        }

        function analyzeSymptoms() {
            if (selectedSymptoms.length === 0) {
                const inputText = document.getElementById('symptomInput').value.trim();
                if (!inputText) {
                    showToast('Please describe your symptoms or select from the list.');
                    return;
                }
            }

            const symptomsText = document.getElementById('symptomInput').value.trim() || selectedSymptoms.join(', ');
            
            showToast('Analyzing your symptoms...');
            document.getElementById('checkHealthBtn').disabled = true;
            document.getElementById('checkHealthBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';

            fetch('/api/analyze-symptoms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    symptoms: symptomsText
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const condition = data.condition;
                    renderHealthResult({
                        name: condition.name,
                        iconClass: condition.icon,
                        description: condition.description,
                        severity: condition.severity,
                        severityText: condition.severity_text,
                        remedies: condition.remedies,
                        activities: condition.activities.map(a => ({ title: a })),
                        warnings: condition.warnings
                    });
                    
                    if (data.matched_symptoms && data.matched_symptoms.length > 0) {
                        showToast(`Matched symptoms: ${data.matched_symptoms.join(', ')}`);
                    }
                } else {
                    showToast(data.message || 'Error analyzing symptoms. Please try again.');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Network error. Please check your connection and try again.');
            })
            .finally(() => {
                document.getElementById('checkHealthBtn').disabled = false;
                document.getElementById('checkHealthBtn').innerHTML = '<i class="fas fa-stethoscope"></i> Check My Health';
            });
        }

        function renderHealthResult(condition) {
            document.getElementById('conditionIcon').innerHTML = '<i class="' + condition.iconClass + '"></i>';
            document.getElementById('conditionName').textContent = condition.name;
            document.getElementById('conditionDesc').textContent = condition.description;
            document.getElementById('severityText').textContent = condition.severityText;

            const fill = document.getElementById('severityFill');
            fill.style.width = '0%';
            setTimeout(() => {
                fill.style.width = condition.severity + '%';
            }, 50);

            document.getElementById('remediesBody').innerHTML = condition.remedies.map(item =>
                '<div class="line-item"><strong>' + item.title + '</strong>' + item.desc + '</div>'
            ).join('');

            document.getElementById('activitiesBody').innerHTML = condition.activities.map(item =>
                '<div class="line-item"><strong>' + item.title + '</strong></div>'
            ).join('');

            document.getElementById('doctorWarningList').innerHTML = condition.warnings.map(item =>
                '<li>' + item + '</li>'
            ).join('');

            const panel = document.getElementById('healthResultPanel');
            panel.classList.add('show');
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function resetHealthChecker() {
            selectedSymptoms = [];
            detectedSymptoms.clear();
            document.getElementById('symptomInput').value = '';
            document.getElementById('detectedSymptomsSection').style.display = 'none';
            document.querySelectorAll('.quick-btn').forEach(btn => btn.classList.remove('selected'));
            renderChips();
            updateCheckButton();
            document.getElementById('healthResultPanel').classList.remove('show');
        }

        document.addEventListener('DOMContentLoaded', () => {
            renderSymptomButtons();
            renderChips();
        });
    
