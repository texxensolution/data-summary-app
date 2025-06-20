let parsedData = [];
let consolidatedData = [];
let summaryStats = null;
let manualColumnMappings = {};
let clusterLookup = {};
let fileBankTypes = {}; // Store BPI/BDO/SHARED for each file
let fileVisitTypes = {}; // Store CI/SHARED for each file

const standardColumns = {
    bank: ['BANK NAME', 'BANK', 'bank_txt', 'BANK NAME REAL'],
    area: ['AREA', 'FINAL AREA', 'final_area_txt', 'AREA CLUSTER'],
    cluster: ['CLUSTER', 'CH CODE', 'CH NAME'],
    status: ['account_status', 'STATUS', 'reported_status', 'OPEN CI STATUS', 'RESULT', 'VISIT STATUS'],
    fieldRider: ['ASSIGNED FS', 'FIELDMAN', 'Creator', 'FIELD RIDER', 'FS NAME'],
    chCode: ['CH CODE', 'REF CODE', 'REFERENCE'],
    date: ['Creation Date', 'Result_Date', 'result_date', 'VISITED DATE', 'Modified Date', 'DATE']
};

document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
});

function initializeEventListeners() {
    const fileInput = document.getElementById('file-input');
    const dropzone = document.getElementById('dropzone');
    const clusterFileInput = document.getElementById('cluster-file-input');

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    clusterFileInput.addEventListener('change', handleClusterFileUpload);

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const droppedFiles = Array.from(e.dataTransfer.files);
        processFiles(droppedFiles);
    });

    document.getElementById('export-all-csv').addEventListener('click', exportAllData);
    document.getElementById('export-summary').addEventListener('click', exportSummaryImage);
    document.getElementById('use-auto-mapping').addEventListener('click', useAutoMapping);
    document.getElementById('apply-mapping').addEventListener('click', applyManualMapping);
    
    // Cancel filter event listener
    document.getElementById('exclude-cancel').addEventListener('change', function() {
        if (consolidatedData.length > 0) {
            generateSummary();
            showSummary();
        }
    });
}

async function handleClusterFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, {
            cellStyles: true,
            cellFormulas: true,
            cellDates: true,
            cellNF: true,
            sheetStubs: true
        });

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const clusterData = XLSX.utils.sheet_to_json(firstSheet);

        // Build lookup table
        clusterLookup = {};
        clusterData.forEach(row => {
            if (row['FINAL AREA'] && row['AREA CLUSTER']) {
                const area = row['FINAL AREA'].toString().trim().toUpperCase();
                clusterLookup[area] = {
                    cluster: row['AREA CLUSTER'],
                    captain: row['AREA CAPTAIN'] || 'Unknown'
                };
            }
        });

        updateClusterStatus(true, `Loaded ${Object.keys(clusterLookup).length} area-cluster mappings from ${file.name}`);
        console.log('Cluster lookup loaded from uploaded file:', clusterLookup);

    } catch (error) {
        console.error('Error loading cluster file:', error);
        updateClusterStatus(false, 'Error loading cluster file');
        alert('Error loading cluster file. Please ensure it\'s a valid Excel file with FINAL AREA and AREA CLUSTER columns.');
    }
}

function updateClusterStatus(loaded, message) {
    const indicator = document.getElementById('cluster-indicator');
    const status = document.getElementById('cluster-status');
    
    if (loaded) {
        indicator.classList.add('loaded');
        status.textContent = message;
        status.style.color = '#059669';
    } else {
        indicator.classList.remove('loaded');
        status.textContent = message;
        status.style.color = '#dc2626';
    }
}

function lookupCluster(area) {
    if (!area || Object.keys(clusterLookup).length === 0) {
        return 'Unknown';
    }
    
    const normalizedArea = area.toString().trim().toUpperCase();
    const clusterInfo = clusterLookup[normalizedArea];
    
    return clusterInfo ? clusterInfo.cluster : 'Unknown';
}

async function handleFileUpload(event) {
    const uploadedFiles = Array.from(event.target.files);
    await processFiles(uploadedFiles);
}

async function processFiles(files) {
    if (files.length === 0) return;

    const loadingElement = document.getElementById('loading');
    loadingElement.classList.remove('hidden');
    
    try {
        parsedData = [];
        consolidatedData = [];
        summaryStats = null;
        manualColumnMappings = {};
        fileBankTypes = {};
        fileVisitTypes = {};
        
        for (const file of files) {
            try {
                const text = await file.text();
                const parsed = Papa.parse(text, {
                    header: true,
                    dynamicTyping: true,
                    skipEmptyLines: true,
                    delimitersToGuess: [',', '\t', '|', ';']
                });
                
                if (parsed.errors && parsed.errors.length > 0) {
                    console.warn(`Parsing warnings for ${file.name}:`, parsed.errors);
                }
                
                const cleanedData = parsed.data
                    .filter(row => {
                        return Object.values(row).some(value => 
                            value !== null && 
                            value !== undefined && 
                            value !== '' && 
                            String(value).trim() !== ''
                        );
                    })
                    .map(row => {
                        const cleanRow = {};
                        Object.keys(row).forEach(key => {
                            const cleanKey = key.trim();
                            cleanRow[cleanKey] = row[key];
                        });
                        return cleanRow;
                    });
                
                if (cleanedData.length > 0) {
                    parsedData.push({
                        name: file.name,
                        data: cleanedData,
                        headers: Object.keys(cleanedData[0] || {}),
                        rowCount: cleanedData.length
                    });
                }
                
            } catch (fileError) {
                console.error(`Error processing file ${file.name}:`, fileError);
                alert(`Error processing file ${file.name}. Please check if it's a valid CSV file.`);
            }
        }
        
        if (parsedData.length === 0) {
            alert('No valid data found in the uploaded files.');
            return;
        }
        
        showColumnMapping();
        console.log('File processing completed successfully!');
        
    } catch (error) {
        console.error('Error processing files:', error);
        alert('Error processing files. Please try again with valid CSV files.');
    } finally {
        loadingElement.classList.add('hidden');
        const fileInput = document.getElementById('file-input');
        fileInput.value = '';
    }
}

function showColumnMapping() {
    const mappingSection = document.getElementById('mapping-section');
    const mappingContainer = document.getElementById('mapping-container');
    
    mappingContainer.innerHTML = '';
    manualColumnMappings = {};
    fileBankTypes = {};
    fileVisitTypes = {};
    
    parsedData.forEach((file, fileIndex) => {
        const autoMapping = {};
        Object.keys(standardColumns).forEach(stdCol => {
            const matchedCol = file.headers.find(header => 
                standardColumns[stdCol].some(variant => 
                    header.toUpperCase().includes(variant.toUpperCase())
                )
            );
            if (matchedCol) {
                autoMapping[stdCol] = matchedCol;
            }
        });
        
        manualColumnMappings[fileIndex] = autoMapping;
        
        // Set default classifications
        fileBankTypes[fileIndex] = 'SHARED';
        fileVisitTypes[fileIndex] = 'SHARED';
        
        const fileMapping = document.createElement('div');
        fileMapping.className = 'mapping-group';
        
        fileMapping.innerHTML = `
            <div class="file-header">
                📄 ${file.name} (${file.rowCount} rows)
            </div>
            
            <div class="file-classification">
                <h5>📋 File Classification</h5>
                <div class="classification-row">
                    <div class="classification-item">
                        <label>Bank Type (for Worklist)</label>
                        <select class="classification-select" data-file-index="${fileIndex}" data-type="bank">
                            <option value="BPI">BPI</option>
                            <option value="BDO">BDO</option>
                            <option value="SHARED" selected>SHARED</option>
                        </select>
                    </div>
                    <div class="classification-item">
                        <label>Visit Type (for Results)</label>
                        <select class="classification-select" data-file-index="${fileIndex}" data-type="visit">
                            <option value="CI">CI</option>
                            <option value="SHARED" selected>SHARED</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="mapping-grid">
                ${Object.keys(standardColumns).map(columnType => `
                    <div>
                        <label class="mapping-label">
                            ${columnType.replace(/([A-Z])/g, ' $1').trim()}
                        </label>
                        <select class="mapping-select" data-file-index="${fileIndex}" data-column-type="${columnType}">
                            <option value="">-- Select Column --</option>
                            ${file.headers.map(header => `
                                <option value="${header}" ${autoMapping[columnType] === header ? 'selected' : ''}>
                                    ${header}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                `).join('')}
            </div>
        `;
        
        mappingContainer.appendChild(fileMapping);
    });
    
    // Add event listeners for all selects
    document.querySelectorAll('.mapping-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const fileIndex = parseInt(e.target.getAttribute('data-file-index'));
            const columnType = e.target.getAttribute('data-column-type');
            const selectedValue = e.target.value;
            
            if (!manualColumnMappings[fileIndex]) {
                manualColumnMappings[fileIndex] = {};
            }
            manualColumnMappings[fileIndex][columnType] = selectedValue;
        });
    });
    
    // Add event listeners for classification selects
    document.querySelectorAll('.classification-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const fileIndex = parseInt(e.target.getAttribute('data-file-index'));
            const type = e.target.getAttribute('data-type');
            const selectedValue = e.target.value;
            
            if (type === 'bank') {
                fileBankTypes[fileIndex] = selectedValue;
            } else if (type === 'visit') {
                fileVisitTypes[fileIndex] = selectedValue;
            }
        });
    });
    
    mappingSection.classList.remove('hidden');
}

function useAutoMapping() {
    manualColumnMappings = {};
    parsedData.forEach((file, fileIndex) => {
        const autoMapping = {};
        Object.keys(standardColumns).forEach(stdCol => {
            const matchedCol = file.headers.find(header => 
                standardColumns[stdCol].some(variant => 
                    header.toUpperCase().includes(variant.toUpperCase())
                )
            );
            if (matchedCol) {
                autoMapping[stdCol] = matchedCol;
            }
        });
        manualColumnMappings[fileIndex] = autoMapping;
        
        // Auto-detect bank and visit types from filename
        const filename = file.name.toLowerCase();
        if (filename.includes('bpi')) {
            fileBankTypes[fileIndex] = 'BPI';
        } else if (filename.includes('bdo')) {
            fileBankTypes[fileIndex] = 'BDO';
        } else {
            fileBankTypes[fileIndex] = 'SHARED';
        }
        
        if (filename.includes('ci') || filename.includes('collection')) {
            fileVisitTypes[fileIndex] = 'CI';
        } else {
            fileVisitTypes[fileIndex] = 'SHARED';
        }
    });
    
    // Update all selects with auto-mapped values
    document.querySelectorAll('.mapping-select').forEach(select => {
        const fileIndex = parseInt(select.getAttribute('data-file-index'));
        const columnType = select.getAttribute('data-column-type');
        const autoValue = manualColumnMappings[fileIndex]?.[columnType] || '';
        select.value = autoValue;
    });
    
    // Update classification selects
    document.querySelectorAll('.classification-select').forEach(select => {
        const fileIndex = parseInt(select.getAttribute('data-file-index'));
        const type = select.getAttribute('data-type');
        
        if (type === 'bank') {
            select.value = fileBankTypes[fileIndex];
        } else if (type === 'visit') {
            select.value = fileVisitTypes[fileIndex];
        }
    });
    
    alert('Auto-mapping applied! Review the selections and click "Apply & Continue" to proceed.');
}

function applyManualMapping() {
    const hasMappings = Object.values(manualColumnMappings).some(mapping => 
        Object.values(mapping).some(value => value !== '')
    );
    
    if (!hasMappings) {
        alert('Please map at least some columns before proceeding.');
        return;
    }
    
    consolidateData();
    generateSummary();
    showSummary();
    
    document.getElementById('mapping-section').classList.add('hidden');
}

function consolidateData() {
    try {
        consolidatedData = [];
        
        if (!parsedData || parsedData.length === 0) {
            console.log('No parsed data available for consolidation');
            return;
        }
        
        parsedData.forEach((file, fileIndex) => {
            console.log(`Processing file: ${file.name} with ${file.data.length} rows`);
            
            const columnMap = manualColumnMappings[fileIndex] || {};
            const bankType = fileBankTypes[fileIndex] || 'SHARED';
            const visitType = fileVisitTypes[fileIndex] || 'SHARED';
            
            file.data.forEach((row, rowIndex) => {
                const hasData = Object.values(row).some(value => 
                    value !== null && 
                    value !== undefined && 
                    value !== '' && 
                    String(value).trim() !== ''
                );
                
                if (hasData) {
                    const area = row[columnMap.area] || 'Unknown';
                    const clusterFromLookup = lookupCluster(area);
                    
                    const consolidatedRow = {
                        fileName: file.name,
                        bank: row[columnMap.bank] || 'Unknown',
                        area: area,
                        cluster: clusterFromLookup,
                        status: row[columnMap.status] || 'Unknown',
                        fieldRider: row[columnMap.fieldRider] || 'Unknown',
                        chCode: row[columnMap.chCode] || 'Unknown',
                        date: row[columnMap.date] || 'Unknown',
                        bankType: bankType,
                        visitType: visitType,
                        originalRow: row
                    };
                    consolidatedData.push(consolidatedRow);
                }
            });
        });
        
        console.log(`Consolidated ${consolidatedData.length} total records from ${parsedData.length} files`);
        
    } catch (error) {
        console.error('Error in consolidateData:', error);
        alert('Error consolidating data. Please check your CSV file format.');
    }
}

function generateSummary() {
    try {
        if (!consolidatedData || consolidatedData.length === 0) {
            console.log('No consolidated data available for summary generation');
            summaryStats = null;
            return;
        }

        // Check if cancel should be excluded
        const excludeCancel = document.getElementById('exclude-cancel')?.checked || false;
        
        // Filter data based on cancel exclusion
        const filteredData = excludeCancel 
            ? consolidatedData.filter(row => 
                !row.status.toLowerCase().includes('cancel')
            )
            : consolidatedData;

        const stats = {
            total: filteredData.length,
            totalAll: consolidatedData.length,
            byBank: {},
            byArea: {},
            byStatus: {},
            byFieldRider: {},
            byCluster: {},
            byBankType: {},
            byVisitType: {}
        };

        filteredData.forEach(row => {
            stats.byBank[row.bank] = (stats.byBank[row.bank] || 0) + 1;
            stats.byArea[row.area] = (stats.byArea[row.area] || 0) + 1;
            stats.byStatus[row.status] = (stats.byStatus[row.status] || 0) + 1;
            stats.byFieldRider[row.fieldRider] = (stats.byFieldRider[row.fieldRider] || 0) + 1;
            stats.byCluster[row.cluster] = (stats.byCluster[row.cluster] || 0) + 1;
            stats.byBankType[row.bankType] = (stats.byBankType[row.bankType] || 0) + 1;
            stats.byVisitType[row.visitType] = (stats.byVisitType[row.visitType] || 0) + 1;
        });

        summaryStats = {
            total: stats.total,
            totalAll: stats.totalAll,
            filteredData: filteredData,
            byBank: Object.entries(stats.byBank).sort((a, b) => b[1] - a[1]),
            byArea: Object.entries(stats.byArea).sort((a, b) => b[1] - a[1]),
            byStatus: Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1]),
            byFieldRider: Object.entries(stats.byFieldRider).sort((a, b) => b[1] - a[1]),
            byCluster: Object.entries(stats.byCluster).sort((a, b) => b[1] - a[1]),
            byBankType: Object.entries(stats.byBankType).sort((a, b) => b[1] - a[1]),
            byVisitType: Object.entries(stats.byVisitType).sort((a, b) => b[1] - a[1])
        };
        
        console.log('Summary stats generated:', summaryStats);
        
    } catch (error) {
        console.error('Error in generateSummary:', error);
        summaryStats = null;
        alert('Error generating summary statistics.');
    }
}

function showSummary() {
    if (!summaryStats) return;

    const excludeCancel = document.getElementById('exclude-cancel')?.checked || false;
    const displayText = excludeCancel 
        ? `📈 Total Records: ${summaryStats.total.toLocaleString()} (${summaryStats.totalAll.toLocaleString()} total, ${summaryStats.totalAll - summaryStats.total} cancelled excluded)`
        : `📈 Total Records: ${summaryStats.total.toLocaleString()}`;
    
    document.getElementById('total-records').textContent = displayText;

    createWorklistTable();
    createResultTable();
    createFieldRiderTable();

    const summaryCards = document.getElementById('summary-cards');
    summaryCards.innerHTML = '';

    const cardConfigs = [
        { title: '🏦 By Bank', data: summaryStats.byBank, color: '#10b981' },
        { title: '📍 By Area', data: summaryStats.byArea, color: '#3b82f6' },
        { title: '📊 By Status', data: summaryStats.byStatus, color: '#ef4444' },
        { title: '👤 By Field Rider', data: summaryStats.byFieldRider, color: '#f59e0b' },
        { title: '🏢 By Cluster', data: summaryStats.byCluster, color: '#8b5cf6' },
        { title: '🏦 By Bank Type', data: summaryStats.byBankType, color: '#06b6d4' },
        { title: '🎯 By Visit Type', data: summaryStats.byVisitType, color: '#84cc16' }
    ];

    cardConfigs.forEach(config => {
        const card = createSummaryCard(config);
        summaryCards.appendChild(card);
    });

    document.getElementById('summary-section').classList.remove('hidden');
}

function createWorklistTable() {
    if (!summaryStats || !summaryStats.filteredData.length) return;

    const dataToUse = summaryStats.filteredData;
    const clusterData = {};

    // Group data by cluster for worklist
    dataToUse.forEach(row => {
        const cluster = row.cluster;
        if (!clusterData[cluster]) {
            clusterData[cluster] = {
                bpiSkip: 0,
                bdoSkip: 0,
                shared: 0,
                total: 0
            };
        }
        
        // Use the bankType classification
        if (row.bankType === 'BPI') {
            clusterData[cluster].bpiSkip += 1;
        } else if (row.bankType === 'BDO') {
            clusterData[cluster].bdoSkip += 1;
        } else {
            clusterData[cluster].shared += 1;
        }
        
        clusterData[cluster].total += 1;
    });

    const tableContainer = document.getElementById('worklist-table');
    const currentDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th colspan="5" class="table-header-main">
                        ${currentDate.toUpperCase()} 8AM
                    </th>
                </tr>
                <tr>
                    <th colspan="5" class="table-subheader" style="background-color: #64748b !important;">
                        WORKLIST
                    </th>
                </tr>
                <tr>
                    <th class="table-subheader">AREA CLUSTER</th>
                    <th class="table-subheader">BPI SKIP</th>
                    <th class="table-subheader">BDO SKIP</th>
                    <th class="table-subheader">SHARED</th>
                    <th class="table-subheader">TOTAL</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Calculate totals
    let totalBpiSkip = 0;
    let totalBdoSkip = 0;
    let totalShared = 0;
    let totalRecords = 0;

    // Sort clusters alphabetically for consistent display
    Object.entries(clusterData).sort(([a], [b]) => a.localeCompare(b)).forEach(([cluster, data]) => {
        tableHTML += `
            <tr>
                <td class="area-cell">${cluster}</td>
                <td>${data.bpiSkip}</td>
                <td>${data.bdoSkip}</td>
                <td>${data.shared}</td>
                <td>${data.total}</td>
            </tr>
        `;
        
        totalBpiSkip += data.bpiSkip;
        totalBdoSkip += data.bdoSkip;
        totalShared += data.shared;
        totalRecords += data.total;
    });

    tableHTML += `
            <tr class="total-row">
                <td><strong>TOTAL</strong></td>
                <td><strong>${totalBpiSkip}</strong></td>
                <td><strong>${totalBdoSkip}</strong></td>
                <td><strong>${totalShared}</strong></td>
                <td><strong>${totalRecords}</strong></td>
            </tr>
        </tbody>
    </table>
    `;

    tableContainer.innerHTML = tableHTML;
}

function createResultTable() {
    if (!summaryStats || !summaryStats.filteredData.length) return;

    const dataToUse = summaryStats.filteredData;
    const clusterData = {};

    // Group data by cluster for results
    dataToUse.forEach(row => {
        const cluster = row.cluster;
        if (!clusterData[cluster]) {
            clusterData[cluster] = {
                ciVisits: 0,
                sharedVisits: 0,
                totalVisits: 0,
                uniqueSkiptracers: new Set()
            };
        }
        
        // Use the visitType classification
        if (row.visitType === 'CI') {
            clusterData[cluster].ciVisits += 1;
        } else {
            clusterData[cluster].sharedVisits += 1;
        }
        
        clusterData[cluster].totalVisits += 1;
        clusterData[cluster].uniqueSkiptracers.add(row.fieldRider);
    });

    const tableContainer = document.getElementById('result-table');
    const currentDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th colspan="8" class="table-header-main">
                        ${currentDate.toUpperCase()} RESULT AS OF ${new Date().toLocaleTimeString('en-US', { hour12: true })} (Less Cancel)
                    </th>
                </tr>
                <tr>
                    <th rowspan="2" class="table-subheader">AREA CLUSTER</th>
                    <th colspan="2" class="table-subheader">VISITED</th>
                    <th colspan="5" class="table-subheader" style="background-color: #10b981 !important; color: white;">@1K/FS</th>
                </tr>
                <tr>
                    <th class="table-subheader">CI</th>
                    <th class="table-subheader">SHARED</th>
                    <th class="table-subheader" style="background-color: #10b981 !important; color: white;">TOTAL</th>
                    <th class="table-subheader" style="background-color: #10b981 !important; color: white;">SKIPTRACERS</th>
                    <th class="table-subheader" style="background-color: #10b981 !important; color: white;">PROB. COST</th>
                    <th class="table-subheader" style="background-color: #10b981 !important; color: white;">COST/VISIT</th>
                    <th class="table-subheader" style="background-color: #10b981 !important; color: white;">AVE. VISIT</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Sort clusters alphabetically for consistent display
    Object.entries(clusterData).sort(([a], [b]) => a.localeCompare(b)).forEach(([cluster, data]) => {
        const uniqueSkipTracers = data.uniqueSkiptracers.size;
        const dailySalaryCost = uniqueSkipTracers * 1000;
        const costPerVisit = data.totalVisits > 0 ? (dailySalaryCost / data.totalVisits) : 0;
        const avgVisit = uniqueSkipTracers > 0 ? (data.totalVisits / uniqueSkipTracers) : 0;

        tableHTML += `
            <tr>
                <td class="area-cell">${cluster}</td>
                <td>${data.ciVisits}</td>
                <td>${data.sharedVisits}</td>
                <td style="background-color: #dcfce7; color: #065f46; font-weight: 600;">${data.totalVisits}</td>
                <td style="background-color: #dcfce7; color: #065f46; font-weight: 600;">${uniqueSkipTracers}</td>
                <td style="background-color: #dcfce7; color: #065f46; font-weight: 600;">${dailySalaryCost.toLocaleString()}</td>
                <td style="background-color: #dcfce7; color: #065f46; font-weight: 600;">${costPerVisit.toFixed(2)}</td>
                <td style="background-color: #dcfce7; color: #065f46; font-weight: 600;">${avgVisit.toFixed(2)}</td>
            </tr>
        `;
    });

    // Calculate totals for results
    const allUniqueSkiptracers = new Set();
    let totalCiVisits = 0;
    let totalSharedVisits = 0;
    let totalVisits = 0;
    
    dataToUse.forEach(row => {
        allUniqueSkiptracers.add(row.fieldRider);
        if (row.visitType === 'CI') {
            totalCiVisits += 1;
        } else {
            totalSharedVisits += 1;
        }
        totalVisits += 1;
    });

    const totalUniqueSkiptracers = allUniqueSkiptracers.size;
    const totalDailySalaryCost = totalUniqueSkiptracers * 1000;
    const totalCostPerVisit = totalVisits > 0 ? (totalDailySalaryCost / totalVisits) : 0;
    const totalAvgVisit = totalUniqueSkiptracers > 0 ? (totalVisits / totalUniqueSkiptracers) : 0;

    tableHTML += `
            <tr class="total-row">
                <td><strong>TOTAL</strong></td>
                <td><strong>${totalCiVisits}</strong></td>
                <td><strong>${totalSharedVisits}</strong></td>
                <td style="background-color: #dbeafe;"><strong>${totalVisits}</strong></td>
                <td style="background-color: #dbeafe;"><strong>${totalUniqueSkiptracers}</strong></td>
                <td style="background-color: #dbeafe;"><strong>${totalDailySalaryCost.toLocaleString()}</strong></td>
                <td style="background-color: #dbeafe;"><strong>${totalCostPerVisit.toFixed(2)}</strong></td>
                <td style="background-color: #dbeafe;"><strong>${totalAvgVisit.toFixed(2)}</strong></td>
            </tr>
        </tbody>
    </table>
    `;

    tableContainer.innerHTML = tableHTML;
}

function createFieldRiderTable() {
    if (!summaryStats || !summaryStats.filteredData.length) {
        console.log('No summary stats or filtered data available for field rider table');
        return;
    }

    const dataToUse = summaryStats.filteredData;
    const fieldRiderData = {};

    console.log('Creating field rider table with data:', dataToUse.length, 'records');

    // Group data by field rider, cluster, and area
    dataToUse.forEach((row, index) => {
        const fieldRider = row.fieldRider || 'Unknown';
        const cluster = row.cluster || 'Unknown';
        const area = row.area || 'Unknown';
        
        // Debug: Log first few rows to check data structure
        if (index < 5) {
            console.log('Row', index, ':', {
                fieldRider: row.fieldRider,
                cluster: row.cluster,
                area: row.area,
                visitType: row.visitType
            });
        }
        
        if (!fieldRiderData[fieldRider]) {
            fieldRiderData[fieldRider] = {};
        }
        
        // Use cluster-area combination as key
        const clusterAreaKey = `${cluster}|${area}`;
        if (!fieldRiderData[fieldRider][clusterAreaKey]) {
            fieldRiderData[fieldRider][clusterAreaKey] = {
                cluster: cluster,
                area: area,
                shared: 0,
                ci: 0,
                total: 0
            };
        }
        
        // Count based on visit type
        if (row.visitType === 'CI') {
            fieldRiderData[fieldRider][clusterAreaKey].ci += 1;
        } else {
            fieldRiderData[fieldRider][clusterAreaKey].shared += 1;
        }
        
        fieldRiderData[fieldRider][clusterAreaKey].total += 1;
    });

    console.log('Field rider data grouped:', fieldRiderData);

    // Get unique clusters for filter dropdown
    const allClusters = [...new Set(dataToUse.map(row => row.cluster || 'Unknown'))].sort();

    const tableContainer = document.getElementById('field-rider-table');
    if (!tableContainer) {
        console.error('Field rider table container not found');
        return;
    }

    const currentDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    // Create cluster filter dropdown
    const clusterFilterHTML = `
        <div class="field-rider-controls">
            <label for="cluster-filter">Filter by Cluster:</label>
            <select id="cluster-filter" class="area-filter-select">
                <option value="">All Clusters (${allClusters.length} total)</option>
                ${allClusters.map(cluster => `<option value="${cluster}">${cluster}</option>`).join('')}
            </select>
        </div>
    `;

   
    
    let tableHTML = `
        ${clusterFilterHTML}
        <table id="field-rider-data-table">
            <thead>
                <tr>
                    <th colspan="6" class="table-header-main">
                        ${currentDate.toUpperCase()} - FIELD RIDER
                    </th>
                </tr>
                <tr>
                    <th class="table-subheader">FIELD RIDER</th>
                    <th class="table-subheader">CLUSTER</th>
                    <th class="table-subheader">AREA</th>
                    <th class="table-subheader">SHARED</th>
                    <th class="table-subheader">CI</th>
                    <th class="table-subheader">TOTAL</th>
                </tr>
            </thead>
            <tbody id="field-rider-tbody">
    `;

    // Flatten the data for table rows
    const tableRows = [];
    Object.entries(fieldRiderData).forEach(([fieldRider, clusterAreas]) => {
        Object.entries(clusterAreas).forEach(([clusterAreaKey, counts]) => {
            tableRows.push({
                fieldRider,
                cluster: counts.cluster,
                area: counts.area,
                shared: counts.shared,
                ci: counts.ci,
                total: counts.total
            });
        });
    });

    console.log('Table rows to display:', tableRows.length);

    // Sort by field rider, then by cluster, then by area
    tableRows.sort((a, b) => {
        if (a.fieldRider === b.fieldRider) {
            if (a.cluster === b.cluster) {
                return a.area.localeCompare(b.area);
            }
            return a.cluster.localeCompare(b.cluster);
        }
        return a.fieldRider.localeCompare(b.fieldRider);
    });

    // Generate table rows
    if (tableRows.length === 0) {
        tableHTML += `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #64748b;">
                    No field rider data available. Please check if field rider column is properly mapped.
                </td>
            </tr>
        `;
    } else {
        tableRows.forEach(row => {
            tableHTML += `
                <tr class="field-rider-row" data-cluster="${row.cluster}">
                    <td class="field-rider-cell">${row.fieldRider}</td>
                    <td class="cluster-cell">${row.cluster}</td>
                    <td class="area-cell">${row.area}</td>
                    <td>${row.shared}</td>
                    <td>${row.ci}</td>
                    <td>${row.total}</td>
                </tr>
            `;
        });

        // Calculate totals
        const totalShared = tableRows.reduce((sum, row) => sum + row.shared, 0);
        const totalCI = tableRows.reduce((sum, row) => sum + row.ci, 0);
        const totalAll = tableRows.reduce((sum, row) => sum + row.total, 0);

        tableHTML += `
                <tr class="total-row">
                    <td colspan="3"><strong>TOTAL</strong></td>
                    <td><strong>${totalShared}</strong></td>
                    <td><strong>${totalCI}</strong></td>
                    <td><strong>${totalAll}</strong></td>
                </tr>
        `;
    }

    tableHTML += `
        </tbody>
    </table>
    `;

    tableContainer.innerHTML = tableHTML;

    // Add event listener for cluster filter only if there are rows
    if (tableRows.length > 0) {
        const clusterFilter = document.getElementById('cluster-filter');
        if (clusterFilter) {
            clusterFilter.addEventListener('change', function() {
                const selectedCluster = this.value;
                const rows = document.querySelectorAll('.field-rider-row');
                
                let visibleShared = 0;
                let visibleCI = 0;
                let visibleTotal = 0;
                
                rows.forEach(row => {
                    const rowCluster = row.getAttribute('data-cluster');
                    if (selectedCluster === '' || rowCluster === selectedCluster) {
                        row.style.display = '';
                        const cells = row.querySelectorAll('td');
                        visibleShared += parseInt(cells[3].textContent);
                        visibleCI += parseInt(cells[4].textContent);
                        visibleTotal += parseInt(cells[5].textContent);
                    } else {
                        row.style.display = 'none';
                    }
                });
                
                // Update totals row
                const totalRow = document.querySelector('#field-rider-data-table .total-row');
                if (totalRow) {
                    const totalCells = totalRow.querySelectorAll('td');
                    totalCells[1].innerHTML = '<strong>TOTAL</strong>';
                    totalCells[2].innerHTML = `<strong>${visibleShared}</strong>`;
                    totalCells[3].innerHTML = `<strong>${visibleCI}</strong>`;
                    totalCells[4].innerHTML = `<strong>${visibleTotal}</strong>`;
                }
            });
        }
    }
}

function exportFieldRiderSummary() {
    if (!summaryStats || !summaryStats.filteredData.length) {
        alert('No data to export');
        return;
    }

    const dataToUse = summaryStats.filteredData;
    const fieldRiderData = {};

    // Group data by field rider, cluster, and area
    dataToUse.forEach(row => {
        const fieldRider = row.fieldRider || 'Unknown';
        const cluster = row.cluster || 'Unknown';
        const area = row.area || 'Unknown';
        
        if (!fieldRiderData[fieldRider]) {
            fieldRiderData[fieldRider] = {};
        }
        
        const clusterAreaKey = `${cluster}|${area}`;
        if (!fieldRiderData[fieldRider][clusterAreaKey]) {
            fieldRiderData[fieldRider][clusterAreaKey] = {
                cluster: cluster,
                area: area,
                shared: 0,
                ci: 0,
                total: 0
            };
        }
        
        if (row.visitType === 'CI') {
            fieldRiderData[fieldRider][clusterAreaKey].ci += 1;
        } else {
            fieldRiderData[fieldRider][clusterAreaKey].shared += 1;
        }
        
        fieldRiderData[fieldRider][clusterAreaKey].total += 1;
    });

    // Flatten the data for CSV export
    const csvData = [];
    Object.entries(fieldRiderData).forEach(([fieldRider, clusterAreas]) => {
        Object.entries(clusterAreas).forEach(([clusterAreaKey, counts]) => {
            csvData.push({
                'Field Rider': fieldRider,
                'Cluster': counts.cluster,
                'Area': counts.area,
                'Shared': counts.shared,
                'CI': counts.ci,
                'Total': counts.total
            });
        });
    });

    // Sort by field rider, then by cluster, then by area
    csvData.sort((a, b) => {
        if (a['Field Rider'] === b['Field Rider']) {
            if (a['Cluster'] === b['Cluster']) {
                return a['Area'].localeCompare(b['Area']);
            }
            return a['Cluster'].localeCompare(b['Cluster']);
        }
        return a['Field Rider'].localeCompare(b['Field Rider']);
    });

    exportToCSV(csvData, 'Field_Rider_Summary.csv');
}

function createSummaryCard({ title, data, color }) {
    const total = data.reduce((sum, [, value]) => sum + value, 0);
    
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.style.borderLeftColor = color;
    
    const listItems = data.slice(0, 8).map(([key, value]) => `
        <div class="summary-item">
            <span class="summary-label">${key}</span>
            <div class="summary-value">
                <span class="summary-count">${value.toLocaleString()}</span>
                <span class="summary-percent">${((value / total) * 100).toFixed(1)}%</span>
            </div>
        </div>
    `).join('');

    card.innerHTML = `
        <div class="summary-header">
            <h3 class="summary-title">${title}</h3>
            <button class="btn" onclick="exportCardData('${title}', ${JSON.stringify(data).replace(/"/g, '&quot;')})">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </button>
        </div>
        
        <div class="summary-total" style="color: ${color};">
            ${total.toLocaleString()}
        </div>
        
        <div class="summary-list">
            ${listItems}
            ${data.length > 8 ? `
                <div style="text-align: center; padding: 0.75rem; color: #64748b; font-size: 0.875rem; font-weight: 500;">
                    ... and ${data.length - 8} more items
                </div>
            ` : ''}
        </div>
    `;
    
    return card;
}

function exportCardData(title, data) {
    const csvData = data.map(([key, value]) => ({
        [title.replace(/[^\w\s]/gi, '')]: key,
        Count: value,
        Percentage: ((value / data.reduce((sum, [, val]) => sum + val, 0)) * 100).toFixed(2) + '%'
    }));
    
    exportToCSV(csvData, `${title.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_')}_Summary.csv`);
}

function exportWorklistSummary() {
    if (!summaryStats || !summaryStats.filteredData.length) {
        alert('No data to export');
        return;
    }

    const dataToUse = summaryStats.filteredData;
    const clusterData = {};

    dataToUse.forEach(row => {
        const cluster = row.cluster;
        if (!clusterData[cluster]) {
            clusterData[cluster] = {
                bpiSkip: 0,
                bdoSkip: 0,
                shared: 0,
                total: 0
            };
        }
        
        if (row.bankType === 'BPI') {
            clusterData[cluster].bpiSkip += 1;
        } else if (row.bankType === 'BDO') {
            clusterData[cluster].bdoSkip += 1;
        } else {
            clusterData[cluster].shared += 1;
        }
        
        clusterData[cluster].total += 1;
    });

    const csvData = Object.entries(clusterData).map(([cluster, data]) => ({
        'Area Cluster': cluster,
        'BPI Skip': data.bpiSkip,
        'BDO Skip': data.bdoSkip,
        'Shared': data.shared,
        'Total': data.total
    }));

    exportToCSV(csvData, 'Worklist_Summary.csv');
}

function exportResultSummary() {
    if (!summaryStats || !summaryStats.filteredData.length) {
        alert('No data to export');
        return;
    }

    const dataToUse = summaryStats.filteredData;
    const clusterData = {};

    dataToUse.forEach(row => {
        const cluster = row.cluster;
        if (!clusterData[cluster]) {
            clusterData[cluster] = {
                ciVisits: 0,
                sharedVisits: 0,
                totalVisits: 0,
                uniqueSkiptracers: new Set()
            };
        }
        
        if (row.visitType === 'CI') {
            clusterData[cluster].ciVisits += 1;
        } else {
            clusterData[cluster].sharedVisits += 1;
        }
        
        clusterData[cluster].totalVisits += 1;
        clusterData[cluster].uniqueSkiptracers.add(row.fieldRider);
    });

    const csvData = Object.entries(clusterData).map(([cluster, data]) => {
        const uniqueSkipTracers = data.uniqueSkiptracers.size;
        const dailySalaryCost = uniqueSkipTracers * 1000;
        const costPerVisit = data.totalVisits > 0 ? (dailySalaryCost / data.totalVisits) : 0;
        const avgVisit = uniqueSkipTracers > 0 ? (data.totalVisits / uniqueSkipTracers) : 0;

        return {
            'Area Cluster': cluster,
            'CI Visits': data.ciVisits,
            'Shared Visits': data.sharedVisits,
            'Total Visits': data.totalVisits,
            'Unique Skiptracers': uniqueSkipTracers,
            'Daily Salary Cost (1K/FS)': dailySalaryCost,
            'Cost Per Visit': costPerVisit.toFixed(2),
            'Average Visit per Skiptracer': avgVisit.toFixed(2)
        };
    });

    exportToCSV(csvData, 'Result_Summary.csv');
}

function exportAllData() {
    if (!consolidatedData.length) {
        alert('No data to export');
        return;
    }

    const excludeCancel = document.getElementById('exclude-cancel')?.checked || false;
    const dataToExport = excludeCancel 
        ? consolidatedData.filter(row => !row.status.toLowerCase().includes('cancel'))
        : consolidatedData;

    const exportData = dataToExport.map(row => ({
        'File Name': row.fileName,
        'Bank': row.bank,
        'Area': row.area,
        'Cluster': row.cluster,
        'Status': row.status,
        'Field Rider': row.fieldRider,
        'CH Code': row.chCode,
        'Date': row.date,
        'Bank Type': row.bankType,
        'Visit Type': row.visitType
    }));
    
    const filename = excludeCancel ? 'Complete_Data_Export_Less_Cancel.csv' : 'Complete_Data_Export.csv';
    exportToCSV(exportData, filename);
}

function exportToCSV(data, filename) {
    try {
        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
    } catch (error) {
        console.error('Error exporting CSV:', error);
        alert('Error exporting CSV file. Please try again.');
    }
}

function exportSummaryImage() {
    const summaryArea = document.getElementById('summary-export-area');
    if (!summaryArea) {
        alert('No summary to export');
        return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = 1400;
    canvas.height = 900;
    
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#0ea5e9');
    gradient.addColorStop(0.5, '#3b82f6');
    gradient.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('📊 Data Summary Analytics Report', canvas.width / 2, 60);
    
    ctx.font = '18px Inter';
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(`Generated: ${new Date().toLocaleString()}`, canvas.width / 2, 90);
    
    ctx.font = 'bold 28px Inter';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Total Records: ${summaryStats?.total.toLocaleString() || 0}`, canvas.width / 2, 140);
    
    if (summaryStats) {
        let yPos = 190;
        ctx.font = '20px Inter';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        
        const summaries = [
            `🏦 Banks: ${summaryStats.byBank.length} different banks`,
            `📍 Areas: ${summaryStats.byArea.length} different areas`,
            `📊 Status Types: ${summaryStats.byStatus.length} different statuses`,
            `👤 Field Riders: ${summaryStats.byFieldRider.length} different field riders`,
            `🏢 Clusters: ${summaryStats.byCluster.length} different clusters`,
            `🏦 Bank Types: ${summaryStats.byBankType.length} different bank types`,
            `🎯 Visit Types: ${summaryStats.byVisitType.length} different visit types`
        ];
        
        summaries.forEach(text => {
            ctx.fillText(text, 80, yPos);
            yPos += 35;
        });
        
        yPos += 30;
        ctx.font = 'bold 24px Inter';
        ctx.fillText('🔥 Top Items by Category:', 80, yPos);
        yPos += 40;
        
        ctx.font = '18px Inter';
        const categories = [
            { name: '🏦 Top Banks', data: summaryStats.byBank.slice(0, 3) },
            { name: '📍 Top Areas', data: summaryStats.byArea.slice(0, 3) },
            { name: '📊 Top Statuses', data: summaryStats.byStatus.slice(0, 3) },
            { name: '🏦 Bank Types', data: summaryStats.byBankType.slice(0, 3) },
            { name: '🎯 Visit Types', data: summaryStats.byVisitType.slice(0, 3) }
        ];
        
        categories.forEach(category => {
            ctx.font = 'bold 20px Inter';
            ctx.fillText(`${category.name}:`, 80, yPos);
            yPos += 30;
            
            ctx.font = '16px Inter';
            category.data.forEach(([name, count]) => {
                ctx.fillText(`  • ${name}: ${count.toLocaleString()}`, 100, yPos);
                yPos += 25;
            });
            yPos += 15;
        });
    }
    
    canvas.toBlob((blob) => {
        if (blob) {
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = 'Data_Summary_Analytics_Report.png';
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);
        }
    }, 'image/png');
}