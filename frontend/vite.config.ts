import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const backendUrl =
	process.env.BACKEND_INTERNAL_URL ?? process.env.PUBLIC_API_URL ?? 'http://localhost:6100';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		proxy: {
			'/api': {
				target: backendUrl,
				changeOrigin: true
			},
			'/ws': {
				target: backendUrl,
				ws: true
			}
		}
	}
});
