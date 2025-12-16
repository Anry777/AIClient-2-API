// Authentication module - handles token management and API call wrapping
/**
 * Authentication manager class
 */
class AuthManager {
    constructor() {
        this.tokenKey = 'authToken';
        this.expiryKey = 'authTokenExpiry';
        this.baseURL = window.location.origin;
    }

    /**
     * Get stored token
     */
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    /**
     * Get token expiry time
     */
    getTokenExpiry() {
        const expiry = localStorage.getItem(this.expiryKey);
        return expiry ? parseInt(expiry) : null;
    }

    /**
     * Check if token is valid
     */
    isTokenValid() {
        const token = this.getToken();
        const expiry = this.getTokenExpiry();
        
        if (!token) return false;
        
        // If expiry time is set, check if expired
        if (expiry && Date.now() > expiry) {
            this.clearToken();
            return false;
        }
        
        return true;
    }

    /**
     * Save token to local storage
     */
    saveToken(token, rememberMe = false) {
        localStorage.setItem(this.tokenKey, token);
        
        if (rememberMe) {
            const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
            localStorage.setItem(this.expiryKey, expiryTime.toString());
        }
    }

    /**
     * Clear token
     */
    clearToken() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.expiryKey);
    }

    /**
     * Logout
     */
    async logout() {
        this.clearToken();
        window.location.href = '/login.html';
    }
}

/**
 * API call wrapper class
 */
class ApiClient {
    constructor() {
        this.authManager = new AuthManager();
        this.baseURL = window.location.origin;
    }

    /**
     * Get authenticated request headers
     */
    getAuthHeaders() {
        const token = this.authManager.getToken();
        return token ? {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        } : {
            'Content-Type': 'application/json'
        };
    }

    /**
     * Handle 401 error redirect to login page
     */
    handleUnauthorized() {
        this.authManager.clearToken();
        window.location.href = '/login.html';
    }

    /**
     * Generic API request method
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}/api${endpoint}`;
        const headers = {
            ...this.getAuthHeaders(),
            ...options.headers
        };

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            
            // If 401 error, redirect to login page
            if (response.status === 401) {
                this.handleUnauthorized();
                throw new Error('Unauthorized');
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            if (error.message === 'Unauthorized') {
                // Already handled redirect in handleUnauthorized
                throw error;
            }
            console.error('API request error:', error);
            throw error;
        }
    }

    /**
     * GET request
     */
    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    /**
     * POST request
     */
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PUT request
     */
    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE request
     */
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    /**
     * POST request (supports FormData upload)
     */
    async upload(endpoint, formData) {
        const url = `${this.baseURL}/api${endpoint}`;
        
        // Get authentication token
        const token = this.authManager.getToken();
        const headers = {};
        
        // If token exists, add Authorization header
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // For FormData requests, don't add Content-Type header, let browser set it automatically
        const config = {
            method: 'POST',
            headers,
            body: formData
        };

        try {
            const response = await fetch(url, config);
            
            // If 401 error, redirect to login page
            if (response.status === 401) {
                this.handleUnauthorized();
                throw new Error('Unauthorized');
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            if (error.message === 'Unauthorized') {
                // Already handled redirect in handleUnauthorized
                throw error;
            }
            console.error('API request error:', error);
            throw error;
        }
    }
}

/**
 * Initialize authentication check
 */
async function initAuth() {
    const authManager = new AuthManager();
    
    // Check if there's already a valid token
    if (authManager.isTokenValid()) {
        // Verify if token is still valid (send a test request)
        try {
            const apiClient = new ApiClient();
            await apiClient.get('/health');
            return true;
        } catch (error) {
            // Token invalid, clear and redirect to login page
            authManager.clearToken();
            window.location.href = '/login.html';
            return false;
        }
    } else {
        // No valid token, redirect to login page
        window.location.href = '/login.html';
        return false;
    }
}

/**
 * Logout function
 */
async function logout() {
    const authManager = new AuthManager();
    await authManager.logout();
}

/**
 * Login function (for login page use)
 */
async function login(password, rememberMe = false) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                password,
                rememberMe
            })
        });

        const data = await response.json();

        if (data.success) {
            // Save token
            const authManager = new AuthManager();
            authManager.saveToken(data.token, rememberMe);
            return { success: true };
        } else {
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, message: 'Login failed. Please check your network connection.' };
    }
}

// Export instances
window.authManager = new AuthManager();
window.apiClient = new ApiClient();
window.initAuth = initAuth;
window.logout = logout;
window.login = login;

// Export AuthManager and ApiClient classes for use by other modules
window.AuthManager = AuthManager;
window.ApiClient = ApiClient;

console.log('Auth module loaded');