import { ref } from 'vue';
import { post, saveToken } from '../api';
export function useAuth(onLogin: () => Promise<void>, onLogout: () => void) {
    const admin = ref(false);
    const loginForm = ref({ username: 'admin', password: '' });
    const loginError = ref('');
    const loginBusy = ref(false);
    async function login() { loginBusy.value = true; loginError.value = ''; try {
        const data = await post<{
            token: string;
        }>('/auth/login', loginForm.value);
        saveToken(data.token);
        admin.value = true;
        loginForm.value.password = '';
        await onLogin();
    }
    catch (e) {
        loginError.value = (e as Error).message;
    }
    finally {
        loginBusy.value = false;
    } }
    async function logout() { try {
        await post('/auth/logout', {});
    }
    finally {
        saveToken(null);
        admin.value = false;
        onLogout();
    } }
    return { admin, loginForm, loginError, loginBusy, login, logout };
}
