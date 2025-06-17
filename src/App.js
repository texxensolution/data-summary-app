import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Upload, FileText, Settings, BarChart3, Users, MapPin, Building, Calendar, TrendingUp, Download, Image } from 'lucide-react';
import Papa from 'papaparse';

const DataSummaryApp = () => {
  const [files, setFiles] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [activeTab, setActiveTab] = useState('upload');
  const [loading, setLoading] = useState(false);
  const summaryRef = useRef(null);

  // Standard column mappings for common variations
  const standardColumns = {
    bank: ['BANK NAME', 'BANK', 'bank_txt', 'BANK NAME REAL'],
    area: ['AREA', 'FINAL AREA', 'final_area_txt'],
    cluster: ['CLUSTER', 'CH CODE', 'CH NAME'],
    status: ['account_status', 'STATUS', 'reported_status', 'OPEN CI STATUS'],
    fieldRider: ['ASSIGNED FS', 'FIELDMAN', 'Creator'],
    chCode: ['CH CODE', 'REF CODE'],
    date: ['Creation Date', 'Result_Date', 'result_date', 'VISITED DATE', 'Modified Date'],
    subStatus: ['sub_status', 'SUBSTATUS', 'PROGRESS']
  };

  const handleFileUpload = useCallback(async (event) => {
    const uploadedFiles = Array.from(event.target.files);
    setLoading(true);
    
    try {
      const fileData = [];
      
      for (const file of uploadedFiles) {
        const text = await file.text();
        const parsed = Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          delimitersToGuess: [',', '\t', '|', ';']
        });
        
        // Clean headers by trimming whitespace
        const cleanedData = parsed.data.map(row => {
          const cleanRow = {};
          Object.keys(row).forEach(key => {
            const cleanKey = key.trim();
            cleanRow[cleanKey] = row[key];
          });
          return cleanRow;
        });
        
        fileData.push({
          name: file.name,
          data: cleanedData,
          headers: Object.keys(cleanedData[0] || {}),
          rowCount: cleanedData.length
        });
      }
      
      setFiles(uploadedFiles);
      setParsedData(fileData);
      
      // Auto-detect column mappings
      const autoMappings = {};
      fileData.forEach((file, fileIndex) => {
        autoMappings[fileIndex] = {};
        Object.keys(standardColumns).forEach(stdCol => {
          const matchedCol = file.headers.find(header => 
            standardColumns[stdCol].some(variant => 
              header.toUpperCase().includes(variant.toUpperCase())
            )
          );
          if (matchedCol) {
            autoMappings[fileIndex][stdCol] = matchedCol;
          }
        });
      });
      
      setColumnMappings(autoMappings);
      setActiveTab('configure');
    } catch (error) {
      console.error('Error parsing files:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateColumnMapping = (fileIndex, columnType, selectedColumn) => {
    setColumnMappings(prev => ({
      ...prev,
      [fileIndex]: {
        ...prev[fileIndex],
        [columnType]: selectedColumn
      }
    }));
  };

  const consolidatedData = useMemo(() => {
    if (!parsedData.length) return [];
    
    const consolidated = [];
    
    parsedData.forEach((file, fileIndex) => {
      const mapping = columnMappings[fileIndex] || {};
      
      file.data.forEach(row => {
        const consolidatedRow = {
          _fileName: file.name,
          _fileIndex: fileIndex,
          bank: row[mapping.bank] || 'Unknown',
          area: row[mapping.area] || 'Unknown',
          cluster: row[mapping.cluster] || 'Unknown',
          status: row[mapping.status] || 'Unknown',
          fieldRider: row[mapping.fieldRider] || 'Unknown',
          chCode: row[mapping.chCode] || 'Unknown',
          date: row[mapping.date] || 'Unknown',
          subStatus: row[mapping.subStatus] || 'Unknown',
          _originalRow: row
        };
        consolidated.push(consolidatedRow);
      });
    });
    
    return consolidated;
  }, [parsedData, columnMappings]);

  const summaryStats = useMemo(() => {
    if (!consolidatedData.length) return null;

    const byArea = {};
    const byBank = {};
    const byUser = {};
    const byStatus = {};
    const byCluster = {};

    // Enhanced breakdown with status details
    const areaStatusBreakdown = {};
    const bankStatusBreakdown = {};
    const fieldRiderStatusBreakdown = {};
    const clusterStatusBreakdown = {};

    consolidatedData.forEach(row => {
      // By Area
      byArea[row.area] = (byArea[row.area] || 0) + 1;
      if (!areaStatusBreakdown[row.area]) areaStatusBreakdown[row.area] = {};
      areaStatusBreakdown[row.area][row.status] = (areaStatusBreakdown[row.area][row.status] || 0) + 1;
      
      // By Bank
      byBank[row.bank] = (byBank[row.bank] || 0) + 1;
      if (!bankStatusBreakdown[row.bank]) bankStatusBreakdown[row.bank] = {};
      bankStatusBreakdown[row.bank][row.status] = (bankStatusBreakdown[row.bank][row.status] || 0) + 1;
      
      // By User/Field Rider
      byUser[row.fieldRider] = (byUser[row.fieldRider] || 0) + 1;
      if (!fieldRiderStatusBreakdown[row.fieldRider]) fieldRiderStatusBreakdown[row.fieldRider] = {};
      fieldRiderStatusBreakdown[row.fieldRider][row.status] = (fieldRiderStatusBreakdown[row.fieldRider][row.status] || 0) + 1;
      
      // By Status
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      
      // By Cluster
      byCluster[row.cluster] = (byCluster[row.cluster] || 0) + 1;
      if (!clusterStatusBreakdown[row.cluster]) clusterStatusBreakdown[row.cluster] = {};
      clusterStatusBreakdown[row.cluster][row.status] = (clusterStatusBreakdown[row.cluster][row.status] || 0) + 1;
    });

    console.log('Status breakdowns:', {
      area: areaStatusBreakdown,
      bank: bankStatusBreakdown,
      fieldRider: fieldRiderStatusBreakdown,
      cluster: clusterStatusBreakdown
    });

    return {
      total: consolidatedData.length,
      byArea: Object.entries(byArea).sort((a, b) => b[1] - a[1]),
      byBank: Object.entries(byBank).sort((a, b) => b[1] - a[1]),
      byUser: Object.entries(byUser).sort((a, b) => b[1] - a[1]),
      byStatus: Object.entries(byStatus).sort((a, b) => b[1] - a[1]),
      byCluster: Object.entries(byCluster).sort((a, b) => b[1] - a[1]),
      statusBreakdowns: {
        area: areaStatusBreakdown,
        bank: bankStatusBreakdown,
        fieldRider: fieldRiderStatusBreakdown,
        cluster: clusterStatusBreakdown
      }
    };
  }, [consolidatedData]);

  const exportToCSV = (data, filename) => {
    try {
      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      
      // Use a more robust download method
      if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        // For IE/Edge
        window.navigator.msSaveOrOpenBlob(blob, filename);
      } else {
        // For modern browsers
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 100);
      }
      
      console.log(`Successfully exported: ${filename}`);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Error exporting CSV file. Please try again.');
    }
  };

  const exportToPNG = async (element, filename) => {
    try {
      if (!element) {
        alert('Content not available for export');
        return;
      }

      // Create a more reliable canvas export
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas dimensions
      const rect = element.getBoundingClientRect();
      const scale = 2; // Higher DPI
      canvas.width = rect.width * scale;
      canvas.height = rect.height * scale;
      
      // Scale context for high DPI
      ctx.scale(scale, scale);
      
      // Fill background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      // Get computed styles and render text content
      const textElements = element.querySelectorAll('*');
      const styles = window.getComputedStyle(element);
      
      // Set font
      ctx.fillStyle = '#1f2937';
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      
      let yPosition = 30;
      
      // Add title
      ctx.font = 'bold 18px system-ui';
      ctx.fillText(filename.replace('.png', ''), 20, yPosition);
      yPosition += 40;
      
      // Add timestamp
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(`Generated: ${new Date().toLocaleString()}`, 20, yPosition);
      yPosition += 30;
      
      // Add content from the element
      const textContent = element.innerText || element.textContent || '';
      const lines = textContent.split('\n').filter(line => line.trim());
      
      ctx.fillStyle = '#1f2937';
      ctx.font = '14px system-ui';
      
      lines.forEach(line => {
        if (line.trim() && yPosition < canvas.height / scale - 20) {
          // Wrap long lines
          const maxWidth = rect.width - 40;
          const words = line.split(' ');
          let currentLine = '';
          
          words.forEach(word => {
            const testLine = currentLine + word + ' ';
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine !== '') {
              ctx.fillText(currentLine, 20, yPosition);
              yPosition += 20;
              currentLine = word + ' ';
            } else {
              currentLine = testLine;
            }
          });
          
          if (currentLine.trim()) {
            ctx.fillText(currentLine, 20, yPosition);
            yPosition += 20;
          }
        }
      });
      
      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
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
          
          console.log(`Successfully exported: ${filename}`);
        }
      }, 'image/png', 0.95);
      
    } catch (error) {
      console.error('Error exporting PNG:', error);
      alert('Error exporting image. Please try the CSV export instead.');
    }
  };

  const exportSummaryToCSV = (summaryData, title) => {
    try {
      const csvData = summaryData.map(([key, value]) => ({
        [title]: key,
        Count: value
      }));
      
      // Add total row
      const total = summaryData.reduce((sum, [, value]) => sum + value, 0);
      csvData.push({
        [title]: 'TOTAL',
        Count: total
      });
      
      exportToCSV(csvData, `${title.replace(/\s+/g, '_')}_Summary.csv`);
    } catch (error) {
      console.error('Error exporting summary:', error);
      alert('Error exporting summary. Please try again.');
    }
  };

  const exportConsolidatedData = () => {
    try {
      const exportData = consolidatedData.map(row => ({
        File: row._fileName,
        Bank: row.bank,
        Area: row.area,
        Cluster: row.cluster,
        Status: row.status,
        'Field Rider': row.fieldRider,
        'CH Code': row.chCode,
        Date: row.date,
        'Sub Status': row.subStatus
      }));
      
      exportToCSV(exportData, 'Consolidated_Data_Summary.csv');
    } catch (error) {
      console.error('Error exporting consolidated data:', error);
      alert('Error exporting data. Please try again.');
    }
  };

  const SummaryCard = ({ title, data, icon: Icon, color, breakdownType }) => {
    const total = data.reduce((sum, [, value]) => sum + value, 0);
    const cardRef = useRef(null);
    const [showBreakdown, setShowBreakdown] = useState(false);
    
    const getStatusBreakdown = (itemName) => {
      // Skip breakdown for "By Status" card or if no valid breakdown type
      if (title === "By Status" || !breakdownType || !summaryStats?.statusBreakdowns) {
        return [];
      }
      
      const breakdownData = summaryStats.statusBreakdowns[breakdownType];
      if (!breakdownData || !breakdownData[itemName]) {
        return [];
      }
      
      return Object.entries(breakdownData[itemName]).sort((a, b) => b[1] - a[1]);
    };
    
    return (
      <div ref={cardRef} className="bg-white rounded-lg shadow-md p-6 border-l-4" style={{ borderLeftColor: color }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <div className="flex items-center space-x-2">
            {/* Show status breakdown toggle for all cards except "By Status" */}
            {title !== "By Status" && (
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className={`p-1 rounded text-xs px-2 py-1 ${showBreakdown ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                title="Toggle status breakdown"
              >
                {showBreakdown ? 'Hide' : 'Show'} Status
              </button>
            )}
            <button
              onClick={() => exportToPNG(cardRef.current, `${title.replace(/\s+/g, '_')}_Summary.png`)}
              className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Export to PNG"
            >
              <Image className="w-4 h-4" />
            </button>
            <button
              onClick={() => exportSummaryToCSV(data, title)}
              className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Export to CSV"
            >
              <Download className="w-4 h-4" />
            </button>
            <Icon className="w-6 h-6" style={{ color }} />
          </div>
        </div>
        
        {/* Total Summary */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Total {title}</span>
            <span className="text-lg font-bold" style={{ color }}>
              {total.toLocaleString()}
            </span>
          </div>
        </div>
        
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {data.slice(0, 10).map(([key, value], index) => {
            const statusBreakdown = getStatusBreakdown(key);
            return (
              <div key={key} className="border-b border-gray-100 pb-2">
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600 truncate flex-1 mr-2">{key}</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-gray-800 bg-gray-100 px-2 py-1 rounded text-xs">
                      {value.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500 min-w-10 text-right">
                      {((value / total) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                
                {/* Status Breakdown */}
                {showBreakdown && statusBreakdown.length > 0 && (
                  <div className="ml-4 mt-2 space-y-1">
                    {statusBreakdown.map(([status, count]) => (
                      <div key={status} className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 truncate flex-1 mr-2">└ {status}</span>
                        <div className="flex items-center space-x-1">
                          <span className="text-gray-600 bg-gray-50 px-1 py-0.5 rounded">
                            {count}
                          </span>
                          <span className="text-gray-400 min-w-8 text-right">
                            {((count / value) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {data.length > 10 && (
            <div className="text-xs text-gray-500 pt-2 border-t">
              ... and {data.length - 10} more
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Data Summary Analytics</h1>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              <span>June 17, 2025 8AM</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <nav className="flex space-x-8">
          {[
            { id: 'upload', label: 'Upload Files', icon: Upload },
            { id: 'configure', label: 'Configure Columns', icon: Settings },
            { id: 'summary', label: 'Summary Reports', icon: BarChart3 }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === id
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-8">
        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Upload Your Data Files</h2>
              <p className="text-gray-600 mb-6">
                Upload CSV files (BDO8AM.csv, BPI8AM.csv, DL8AM.csv, etc.) to analyze and summarize your data
              </p>
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-gray-400 transition-colors">
                <input
                  type="file"
                  multiple
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center space-y-2"
                >
                  <Upload className="w-12 h-12 text-gray-400" />
                  <span className="text-lg font-medium text-gray-700">
                    Choose CSV files or drag them here
                  </span>
                  <span className="text-sm text-gray-500">
                    Multiple files supported
                  </span>
                </label>
              </div>

              {loading && (
                <div className="mt-4 text-blue-600">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="ml-2">Processing files...</span>
                </div>
              )}

              {files.length > 0 && (
                <div className="mt-6 text-left">
                  <h3 className="font-semibold text-gray-900 mb-3">Uploaded Files:</h3>
                  <div className="space-y-2">
                    {parsedData.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-5 h-5 text-green-600" />
                          <span className="font-medium text-green-800">{file.name}</span>
                        </div>
                        <div className="text-sm text-green-600">
                          {file.rowCount} rows, {file.headers.length} columns
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Configure Tab */}
        {activeTab === 'configure' && parsedData.length > 0 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Configure Column Mappings</h2>
              <p className="text-gray-600 mb-6">
                Map the columns from your files to standard categories for consistent analysis
              </p>

              {parsedData.map((file, fileIndex) => (
                <div key={fileIndex} className="border rounded-lg p-6 mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    {file.name}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.keys(standardColumns).map(columnType => (
                      <div key={columnType} className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 capitalize">
                          {columnType.replace(/([A-Z])/g, ' $1').trim()}
                        </label>
                        <select
                          value={columnMappings[fileIndex]?.[columnType] || ''}
                          onChange={(e) => updateColumnMapping(fileIndex, columnType, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select column...</option>
                          {file.headers.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && summaryStats && (
          <div className="space-y-6">
            {/* Overview Stats */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">Summary Overview</h2>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => exportToPNG(summaryRef.current, 'Complete_Summary_Report.png')}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Image className="w-4 h-4" />
                    <span>Export as PNG</span>
                  </button>
                  <button
                    onClick={exportConsolidatedData}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>
                  <div className="flex items-center space-x-2 text-lg font-bold text-blue-600">
                    <TrendingUp className="w-6 h-6" />
                    <span>Total Records: {summaryStats.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div ref={summaryRef} className="summary-export-area">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <SummaryCard
                    title="By Area"
                    data={summaryStats.byArea}
                    icon={MapPin}
                    color="#3B82F6"
                    breakdownType="area"
                  />
                  <SummaryCard
                    title="By Bank"
                    data={summaryStats.byBank}
                    icon={Building}
                    color="#10B981"
                    breakdownType="bank"
                  />
                  <SummaryCard
                    title="By Field Rider"
                    data={summaryStats.byUser}
                    icon={Users}
                    color="#F59E0B"
                    breakdownType="fieldRider"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <SummaryCard
                    title="By Status"
                    data={summaryStats.byStatus}
                    icon={BarChart3}
                    color="#EF4444"
                  />
                  <SummaryCard
                    title="By Cluster"
                    data={summaryStats.byCluster}
                    icon={Settings}
                    color="#8B5CF6"
                    breakdownType="cluster"
                  />
                </div>
              </div>

              {/* Consolidated Data Table */}
              <div className="mt-8 bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Consolidated Data Preview</h3>
                  <button
                    onClick={exportConsolidatedData}
                    className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Table</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {['File', 'Bank', 'Area', 'Cluster', 'Status', 'Field Rider', 'CH Code', 'Date'].map(header => (
                          <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {consolidatedData.slice(0, 50).map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {row._fileName.replace('.csv', '')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.bank}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.area}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.cluster}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              {row.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.fieldRider}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.chCode}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {consolidatedData.length > 50 && (
                  <div className="mt-4 text-center text-sm text-gray-500">
                    Showing first 50 of {consolidatedData.length} records
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataSummaryApp;