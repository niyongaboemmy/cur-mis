import { api } from './api';

interface DashboardStats {
  open_grievances: number;
  open_conflicts: number;
  pending_appraisals: number;
  open_recruitment_posts: number;
  avg_turnover_rate: number;
}

export const hrMonitoringService = {
  // Dashboard
  getDashboard: async (): Promise<DashboardStats> => {
    const res = await api.get('/api/hr/monitoring/dashboard');
    return (res as any).data?.data || (res as any).data;
  },

  // Employees listing
  getEmployees: (page = 1, perPage = 25, search = '') =>
    api.get(`/api/hr/monitoring/employees?page=${page}&per_page=${perPage}&search=${search}`).then((res) => res.data),

  // Performance Monitoring
  getAppraisals: (page = 1, perPage = 25) =>
    api.get(`/api/hr/monitoring/appraisals?page=${page}&per_page=${perPage}`).then((res) => res.data),

  createAppraisal: (data: any) =>
    api.post('/api/hr/monitoring/appraisals', data).then((res) => res.data),

  updateAppraisal: (id: number, data: any) =>
    api.put(`/api/hr/monitoring/appraisals/${id}`, data).then((res) => res.data),

  deleteAppraisal: (id: number) =>
    api.delete(`/api/hr/monitoring/appraisals/${id}`).then((res) => res.data),

  // Recruitment
  getRecruitmentPosts: () =>
    api.get('/api/hr/monitoring/recruitment/posts').then((res) => res.data),

  createRecruitmentPost: (data: any) =>
    api.post('/api/hr/monitoring/recruitment/posts', data).then((res) => res.data),

  updateRecruitmentPost: (id: number, data: any) =>
    api.put(`/api/hr/monitoring/recruitment/posts/${id}`, data).then((res) => res.data),

  deleteRecruitmentPost: (id: number) =>
    api.delete(`/api/hr/monitoring/recruitment/posts/${id}`).then((res) => res.data),

  getCandidates: (postId: number) =>
    api.get(`/api/hr/monitoring/recruitment/candidates?post_id=${postId}`).then((res) => res.data),

  createCandidate: (data: any) =>
    api.post('/api/hr/monitoring/recruitment/candidates', data).then((res) => res.data),

  updateCandidate: (id: number, data: any) =>
    api.put(`/api/hr/monitoring/recruitment/candidates/${id}`, data).then((res) => res.data),

  deleteCandidate: (id: number) =>
    api.delete(`/api/hr/monitoring/recruitment/candidates/${id}`).then((res) => res.data),

  // Employee Relations
  getGrievances: (page = 1, perPage = 25) =>
    api.get(`/api/hr/monitoring/grievances?page=${page}&per_page=${perPage}`).then((res) => res.data),

  createGrievance: (data: any) =>
    api.post('/api/hr/monitoring/grievances', data).then((res) => res.data),

  updateGrievanceStatus: (id: number, data: any) =>
    api.put(`/api/hr/monitoring/grievances/${id}`, data).then((res) => res.data),

  deleteGrievance: (id: number) =>
    api.delete(`/api/hr/monitoring/grievances/${id}`).then((res) => res.data),

  getConflictResolutions: () =>
    api.get('/api/hr/monitoring/conflicts').then((res) => res.data),

  recordConflictResolution: (data: any) =>
    api.post('/api/hr/monitoring/conflicts', data).then((res) => res.data),

  updateConflictResolution: (id: number, data: any) =>
    api.put(`/api/hr/monitoring/conflicts/${id}`, data).then((res) => res.data),

  deleteConflictResolution: (id: number) =>
    api.delete(`/api/hr/monitoring/conflicts/${id}`).then((res) => res.data),

  getStaffSatisfactionSurveys: () =>
    api.get('/api/hr/monitoring/surveys').then((res) => res.data),

  getCounselingRecords: (employeeId: number) =>
    api.get(`/api/hr/monitoring/counseling?employee_id=${employeeId}`).then((res) => res.data),

  recordCounselingSession: (data: any) =>
    api.post('/api/hr/monitoring/counseling', data).then((res) => res.data),

  updateCounselingRecord: (id: number, data: any) =>
    api.put(`/api/hr/monitoring/counseling/${id}`, data).then((res) => res.data),

  deleteCounselingRecord: (id: number) =>
    api.delete(`/api/hr/monitoring/counseling/${id}`).then((res) => res.data),

  // Turnover & Retention
  getExitInterviews: () =>
    api.get('/api/hr/monitoring/exit-interviews').then((res) => res.data),

  recordExitInterview: (data: any) =>
    api.post('/api/hr/monitoring/exit-interviews', data).then((res) => res.data),

  updateExitInterview: (id: number, data: any) =>
    api.put(`/api/hr/monitoring/exit-interviews/${id}`, data).then((res) => res.data),

  deleteExitInterview: (id: number) =>
    api.delete(`/api/hr/monitoring/exit-interviews/${id}`).then((res) => res.data),

  getTurnoverAnalytics: () =>
    api.get('/api/hr/monitoring/turnover-analytics').then((res) => res.data),
};
