import api from './api';

export const userService = {
  getProfile: async () => {
    const response = await api.get('/users/me');
    return response.data;
  },

  getUserPosts: async () => {
    const response = await api.get('/users/me/posts');
    return response.data;
  },

  updateProfile: async (formData) => {
    const response = await api.put('/users/me', formData);
    return response.data;
  },

  deleteProfile: async () => {
    const response = await api.delete('/users/me');
    return response.data;
  }
};