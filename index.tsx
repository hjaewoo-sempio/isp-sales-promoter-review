import { GoogleGenAI, Type } from "@google/genai";

// =================================================================================
// App State and Global Variables
// =================================================================================

// Type definitions for the analysis result
interface EvaluationItem {
    criterion: string;
    score: number;
    details: string;
    improvements: string;
}

interface AnalysisResult {
    transcription: string;
    evaluation: EvaluationItem[];
    summary: string;
}

let ai: GoogleGenAI;
let selectedFile: File | null = null;
let analysisResultData: AnalysisResult | null = null;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwN9DL7GGwuCxUxf4vRN-UwadwDHG5CydThF-bzKn73O-XwPJKSHDqW_tCsz_zRLUNt/exec';

// =================================================================================
// DOM Element Selectors
// =================================================================================

// Main Content Elements
const mainContent = document.getElementById('main-content') as HTMLElement;
const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
const fileNameElement = document.getElementById('file-name') as HTMLElement;
const analyzeButton = document.getElementById('analyze-button') as HTMLButtonElement;
const uploadContainer = document.getElementById('upload-container') as HTMLElement;
const loadingContainer = document.getElementById('loading-container') as HTMLElement;
const loadingText = document.getElementById('loading-text') as HTMLElement;
const resultContainer = document.getElementById('result-container') as HTMLElement;
const transcriptionText = document.getElementById('transcription-text') as HTMLElement;
const evaluationDetails = document.getElementById('evaluation-details') as HTMLElement;
const summaryText = document.getElementById('summary-text') as HTMLElement;
const errorMessage = document.getElementById('error-message') as HTMLElement;
const resultFileName = document.getElementById('result-file-name') as HTMLElement;
const totalScoreElement = document.getElementById('total-score') as HTMLElement;
const resetButton = document.getElementById('reset-button') as HTMLButtonElement;
const resetSection = document.getElementById('reset-section') as HTMLElement;

// Google Sheets Save Elements
const saveSection = document.getElementById('save-section') as HTMLElement;
const managerNameInput = document.getElementById('manager-name') as HTMLInputElement;
const employeeNameInput = document.getElementById('employee-name') as HTMLInputElement;
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const saveStatus = document.getElementById('save-status') as HTMLElement;

// API Key Modal Elements
const apiKeyModal = document.getElementById('api-key-modal') as HTMLElement;
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const saveApiKeyButton = document.getElementById('save-api-key-button') as HTMLButtonElement;
const apiKeyError = document.getElementById('api-key-error') as HTMLElement;


// =================================================================================
// Initialization and API Key Handling
// =================================================================================

/**
 * Initializes the application. Checks for an API key in sessionStorage.
 * If found, initializes the AI client. Otherwise, shows the API key modal.
 */
function initializeApp() {
    const apiKey = sessionStorage.getItem('geminiApiKey');
    if (apiKey) {
        initializeAiClient(apiKey);
    } else {
        apiKeyModal.classList.remove('hidden');
    }
}

/**
 * Initializes the GoogleGenAI client with the provided key and shows the main app content.
 * @param apiKey The user-provided Gemini API key.
 */
function initializeAiClient(apiKey: string) {
    try {
        ai = new GoogleGenAI({ apiKey });
        apiKeyModal.classList.add('hidden');
        mainContent.classList.remove('hidden');
    } catch (error) {
        console.error("Failed to initialize GoogleGenAI:", error);
        apiKeyError.textContent = 'API 키가 유효하지 않거나 초기화에 실패했습니다. 키를 확인하고 다시 시도해주세요.';
        apiKeyError.classList.remove('hidden');
        apiKeyModal.classList.remove('hidden'); // Keep modal visible on error
    }
}

// Event listener for the "Save API Key" button
saveApiKeyButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        apiKeyError.textContent = 'API 키를 입력해주세요.';
        apiKeyError.classList.remove('hidden');
        return;
    }
    apiKeyError.classList.add('hidden');
    sessionStorage.setItem('geminiApiKey', apiKey);
    initializeAiClient(apiKey);
});

// =================================================================================
// Core Application Logic
// =================================================================================

// Handle file selection
fileUpload.addEventListener('change', () => {
    if (fileUpload.files && fileUpload.files.length > 0) {
        selectedFile = fileUpload.files[0];
        fileNameElement.textContent = selectedFile.name;
        analyzeButton.disabled = false;
    } else {
        selectedFile = null;
        fileNameElement.textContent = '';
        analyzeButton.disabled = true;
    }
});

// Handle analysis button click
analyzeButton.addEventListener('click', async () => {
    if (!selectedFile) {
        showError('분석할 파일을 먼저 선택해주세요.');
        return;
    }
    if (!ai) {
        showError('API 키가 설정되지 않아 분석을 시작할 수 없습니다. 페이지를 새로고침하여 키를 입력해주세요.');
        return;
    }

    // Show loading state
    uploadContainer.classList.add('hidden');
    resultContainer.classList.add('hidden');
    errorMessage.classList.add('hidden');
    loadingContainer.classList.remove('hidden');
    analysisResultData = null;

    if (loadingText) {
        loadingText.textContent = `"${selectedFile.name}" 파일을 분석 중입니다. 오디오 길이에 따라 몇 분 정도 소요될 수 있습니다...`;
    }

    try {
        const base64File = await fileToBase64(selectedFile);
        const filePart = {
            inlineData: {
                mimeType: selectedFile.type,
                data: base64File,
            },
        };
        
        const prompt = `당신은 판매 사원의 스킬을 분석하고 피드백을 제공하는 전문 코치입니다. 제공된 오디오 파일을 먼저 텍스트로 변환해주세요. 그리고 변환된 텍스트를 바탕으로 아래 10가지 항목('제품특징', '제품사용설명', '묶음판매', '친절', '자신감', '고객소통', '고객 니즈 파악', '개인화된 제품 추천', '재치 있는 멘트', '클로징 능력')에 대해 각각 10점 만점으로 평가하고, 점수의 근거와 개선점을 상세히 설명해주세요. 마지막으로, 사원의 성장을 응원하는 친절하고 격려가 담긴 총평을 "사원님,"으로 시작하여 작성해주세요. 전체 결과를 지정된 JSON 형식으로만 응답해주세요.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [filePart, { text: prompt }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        transcription: { type: Type.STRING, description: "오디오 파일의 텍스트 변환 결과입니다." },
                        evaluation: {
                            type: Type.ARRAY,
                            description: "10가지 항목에 대한 평가 결과입니다.",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    criterion: { 
                                        type: Type.STRING, 
                                        description: `평가 항목 이름입니다. 반드시 다음 중 하나여야 합니다: "제품특징", "제품사용설명", "묶음판매", "친절", "자신감", "고객소통", "고객 니즈 파악", "개인화된 제품 추천", "재치 있는 멘트", "클로징 능력"` 
                                    },
                                    score: { type: Type.INTEGER, description: "10점 만점 기준 점수입니다." },
                                    details: { type: Type.STRING, description: "점수에 대한 상세한 근거입니다." },
                                    improvements: { type: Type.STRING, description: "개선할 점에 대한 구체적인 제안입니다." }
                                },
                                required: ["criterion", "score", "details", "improvements"]
                            }
                        },
                        summary: { type: Type.STRING, description: "사원을 위한 친절한 총평입니다." }
                    },
                    required: ["transcription", "evaluation", "summary"]
                },
                temperature: 0.2,
            },
        });
        
        analysisResultData = JSON.parse(response.text.trim()) as AnalysisResult;
        renderResults(analysisResultData);

    } catch (error) {
        console.error('Error during analysis:', error);
        showError('분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요. (API 키가 유효하지 않을 수 있습니다. 개발자 콘솔을 확인하세요)');
    } finally {
        loadingContainer.classList.add('hidden');
    }
});

// Render results to the DOM
function renderResults(data: AnalysisResult | null) {
    if (!data || !selectedFile) return;

    resultFileName.textContent = selectedFile.name;
    const totalScore = data.evaluation.reduce((sum, item) => sum + (item.score || 0), 0);
    totalScoreElement.textContent = totalScore.toString();

    transcriptionText.textContent = data.transcription || '음성 인식 결과가 없습니다.';

    evaluationDetails.innerHTML = '';
    const criteriaOrder = ["제품특징", "제품사용설명", "묶음판매", "친절", "자신감", "고객소통", "고객 니즈 파악", "개인화된 제품 추천", "재치 있는 멘트", "클로징 능력"];
    const evaluationMap = new Map(data.evaluation.map((item) => [item.criterion, item]));

    criteriaOrder.forEach(criterionName => {
        const item = evaluationMap.get(criterionName);
        if (item) {
             const collapsible = document.createElement('div');
            collapsible.className = 'collapsible';
            collapsible.innerHTML = `
                <button class="collapsible-header">
                    <h3>${item.criterion}</h3>
                    <span class="score">${item.score} / 10</span>
                    <span class="toggle-icon">+</span>
                </button>
                <div class="collapsible-content">
                    <h4>점수 근거</h4>
                    <p>${item.details}</p>
                    <h4>개선할 점</h4>
                    <p>${item.improvements}</p>
                </div>
            `;
            evaluationDetails.appendChild(collapsible);
        }
    });

    summaryText.textContent = data.summary;
    resultContainer.classList.remove('hidden');
    resetSection.classList.remove('hidden');
    saveSection.classList.remove('hidden');
    addCollapsibleListeners();
}

// Add event listeners to collapsible headers
function addCollapsibleListeners() {
    const headers = document.querySelectorAll('.collapsible-header');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const collapsible = header.parentElement;
            if (!collapsible) return;
            collapsible.classList.toggle('active');
            const content = header.nextElementSibling as HTMLElement;
            if (content) {
                if (content.style.maxHeight) {
                    content.style.maxHeight = null;
                } else {
                    content.style.maxHeight = content.scrollHeight + "px";
                }
            }
        });
    });
}

// Reset the app to its initial state
const resetApp = () => {
    resultContainer.classList.add('hidden');
    loadingContainer.classList.add('hidden');
    resetSection.classList.add('hidden');
    saveSection.classList.add('hidden');
    errorMessage.classList.add('hidden');
    uploadContainer.classList.remove('hidden');

    fileUpload.value = '';
    selectedFile = null;
    fileNameElement.textContent = '';
    analyzeButton.disabled = true;

    analysisResultData = null;
    managerNameInput.value = '';
    employeeNameInput.value = '';
    saveStatus.textContent = '';
    saveStatus.className = '';
    saveButton.disabled = false;
};

resetButton.addEventListener('click', resetApp);

// Handle save to Google Sheets button click
saveButton.addEventListener('click', async () => {
    const managerName = managerNameInput.value.trim();
    const employeeName = employeeNameInput.value.trim();

    if (!managerName || !employeeName) {
        saveStatus.textContent = '매니저명과 사원명을 모두 입력해주세요.';
        saveStatus.className = 'error';
        return;
    }
    
    if (!analysisResultData || !selectedFile) {
        saveStatus.textContent = '저장할 분석 데이터가 없습니다.';
        saveStatus.className = 'error';
        return;
    }

    saveButton.disabled = true;
    saveStatus.textContent = '저장 중...';
    saveStatus.className = 'saving';

    const totalScore = analysisResultData.evaluation.reduce((sum, item) => sum + (item.score || 0), 0);

    const payload = {
        timestamp: new Date().toLocaleString('ko-KR'),
        managerName,
        employeeName,
        fileName: selectedFile.name,
        totalScore,
        transcription: analysisResultData.transcription,
        summary: analysisResultData.summary,
        evaluation: analysisResultData.evaluation
    };
    
    console.log("Sending data to Google Sheets:", JSON.stringify(payload, null, 2));

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        saveStatus.textContent = '저장 요청을 보냈습니다. Google Sheet에서 데이터를 확인해주세요.';
        saveStatus.className = 'success';
    } catch (error) {
        console.error('Error saving to Google Sheets:', error);
        saveStatus.textContent = '저장 중 오류가 발생했습니다.';
        saveStatus.className = 'error';
        saveButton.disabled = false;
    }
});

// =================================================================================
// Helper Functions
// =================================================================================

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('Failed to read file as base64 string.'));
            }
        };
        reader.onerror = error => reject(error);
    });
}

function showError(message: string) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    resultContainer.classList.add('hidden'); 
    uploadContainer.classList.remove('hidden');
}

// =================================================================================
// App Entry Point
// =================================================================================

// Initial setup for collapsible elements and app start
addCollapsibleListeners();
initializeApp();
