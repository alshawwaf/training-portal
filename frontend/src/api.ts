import axios from 'axios';

const api = axios.create({
  baseURL: '/api', // Use relative /api path to leverage Vite proxy
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Also check for guest tokens in session storage
  // URL pattern: /classes/{classId}/...
  const classMatch = config.url?.match(/\/classes\/(\d+)/);
  if (classMatch) {
    const classId = classMatch[1];
    const guestToken = sessionStorage.getItem(`guest_token_${classId}`);
    if (guestToken) {
      config.headers['X-Guest-Token'] = guestToken;
    }
  }
  
  return config;
});

export default api;
