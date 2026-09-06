import { useState } from 'react';
import { Download, Upload, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';
import { api, apiClient } from '@/services/api';

const saveBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const errMessage = (error: unknown, fallback: string) =>
  error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback;

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  preview: Record<string, any>[];
}

interface ImportResult {
  success: boolean;
  imported: number;
  updated: number;
  failed: number;
  errors: string[];
}

export default function HRImportExportPage() {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [importType, setImportType] = useState<'employees' | 'payroll' | 'leave' | 'contracts' | 'certificates'>('employees');
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const importTypes = [
    { value: 'employees', label: 'Employee Master List' },
    { value: 'payroll', label: 'Payroll Data' },
    { value: 'leave', label: 'Leave Requests' },
    { value: 'contracts', label: 'Employee Contracts' },
    { value: 'certificates', label: 'Certificates' },
  ];

  const handleDownloadTemplate = async () => {
    try {
      const res = await apiClient.get(`/hr/import/template/${importType}`, { responseType: 'blob' });
      saveBlob(res.data, `hr_template_${importType}.xlsx`);
      toast.success('Template downloaded successfully');
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setValidationResult(null);
      setImportResult(null);
    }
  };

  const handleValidate = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setIsValidating(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('import_type', importType);

      const res = await api.upload<ValidationResult>('/hr/import/validate', formData);
      setValidationResult(res.data);

      if (res.data?.valid) {
        toast.success('File validated successfully');
      } else {
        toast.error(`Found ${res.data?.errors.length ?? 0} validation errors`);
      }
    } catch (error) {
      toast.error(errMessage(error, 'Validation failed'));
    } finally {
      setIsValidating(false);
    }
  };

  const handleProcessImport = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('import_type', importType);

      const res = await api.upload<ImportResult>('/hr/import/process', formData);
      setImportResult(res.data);

      if (res.data?.success) {
        toast.success(`Import completed: ${res.data.imported} imported, ${res.data.updated} updated`);
        setFile(null);
        setValidationResult(null);
      } else {
        toast.error('Import failed');
      }
    } catch (error) {
      toast.error(errMessage(error, 'Import failed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await apiClient.get(`/hr/export/${importType}`, {
        params: { format: 'xlsx' },
        responseType: 'blob',
      });
      saveBlob(res.data, `hr_export_${importType}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Data exported successfully');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">HR Import & Export</h1>
          <p className="text-gray-600 mt-2">Upload or download HR data with validation and error reporting</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab('import')}
            className={`px-6 py-2 rounded-lg font-medium transition ${
              activeTab === 'import'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Upload className="inline mr-2 w-4 h-4" />
            Import
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-6 py-2 rounded-lg font-medium transition ${
              activeTab === 'export'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Download className="inline mr-2 w-4 h-4" />
            Export
          </button>
        </div>

        {/* Import Tab */}
        {activeTab === 'import' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="space-y-6">
              {/* Data Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Data Type to Import
                </label>
                <select
                  value={importType}
                  onChange={(e) => setImportType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {importTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Template Download */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-3">
                  Start by downloading the template for {importTypes.find(t => t.value === importType)?.label}:
                </p>
                <button
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </button>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Upload CSV or Excel File
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="fileInput"
                  />
                  <label htmlFor="fileInput" className="cursor-pointer block">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">
                      {file ? file.name : 'Click to select or drag and drop'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Supports CSV, XLSX, and XLS files (max 10MB)
                    </p>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleValidate}
                  disabled={!file || isValidating}
                  className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {isValidating ? <Loader className="w-4 h-4 animate-spin" /> : null}
                  Validate File
                </button>
                <button
                  onClick={handleProcessImport}
                  disabled={!file || !validationResult?.valid || isImporting}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {isImporting ? <Loader className="w-4 h-4 animate-spin" /> : null}
                  Import Data
                </button>
              </div>

              {/* Validation Results */}
              {validationResult && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${validationResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {validationResult.valid ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <span className={`font-medium ${validationResult.valid ? 'text-green-900' : 'text-red-900'}`}>
                        {validationResult.valid ? 'File is valid' : 'Validation Failed'}
                      </span>
                    </div>
                  </div>

                  {/* Errors */}
                  {validationResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="font-medium text-red-900 mb-2">Errors ({validationResult.errors.length})</h4>
                      <ul className="space-y-1 text-sm text-red-800">
                        {validationResult.errors.slice(0, 10).map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                        {validationResult.errors.length > 10 && (
                          <li className="text-red-600 font-medium">... and {validationResult.errors.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Warnings */}
                  {validationResult.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-medium text-yellow-900 mb-2">Warnings ({validationResult.warnings.length})</h4>
                      <ul className="space-y-1 text-sm text-yellow-800">
                        {validationResult.warnings.map((warning, i) => (
                          <li key={i}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Preview */}
                  {validationResult.preview.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">Preview (First 5 rows)</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b">
                              {Object.keys(validationResult.preview[0]).map((key) => (
                                <th key={key} className="text-left px-2 py-2 text-gray-700 font-medium">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {validationResult.preview.map((row, i) => (
                              <tr key={i} className="border-b hover:bg-gray-100">
                                {Object.values(row).map((value, j) => (
                                  <td key={j} className="px-2 py-2 text-gray-600">
                                    {String(value).substring(0, 50)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Import Results */}
              {importResult && (
                <div className={`p-4 rounded-lg ${importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    {importResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span className={`font-medium ${importResult.success ? 'text-green-900' : 'text-red-900'}`}>
                      {importResult.success ? 'Import Completed' : 'Import Failed'}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className={importResult.success ? 'text-green-800' : 'text-red-800'}>
                      Imported: {importResult.imported} | Updated: {importResult.updated} | Failed: {importResult.failed}
                    </p>
                    {importResult.errors.length > 0 && (
                      <div>
                        <p className="font-medium text-red-900 mb-1">Errors:</p>
                        <ul className="space-y-1 text-red-800">
                          {importResult.errors.map((error, i) => (
                            <li key={i}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Data Type to Export
                </label>
                <select
                  value={importType}
                  onChange={(e) => setImportType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {importTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-sm text-gray-600">
                Export all {importTypes.find(t => t.value === importType)?.label} data to Excel format for reporting or backup.
              </p>

              <button
                onClick={handleExport}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Export as Excel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
