<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';

	interface Props {
		content: Record<string, unknown> | null;
		onSave: (body: Record<string, unknown>) => void;
		onBlur?: () => void;
	}

	let { content, onSave, onBlur }: Props = $props();

	let editorEl: HTMLDivElement;
	let editor: Editor | null = null;

	onMount(() => {
		editor = new Editor({
			element: editorEl,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] },
					bulletList: {},
					orderedList: {},
					bold: {},
					italic: {},
					code: {},
					codeBlock: {}
				}),
				Placeholder.configure({
					placeholder: 'Start typing…'
				})
			],
			content: content && 'type' in content ? content : undefined,
			editorProps: {
				attributes: {
					class: 'note-editor-content'
				}
			},
			onBlur: () => {
				if (editor) {
					onSave(editor.getJSON() as unknown as Record<string, unknown>);
				}
				onBlur?.();
			}
		});

		// Auto-focus
		editor.commands.focus('end');
	});

	onDestroy(() => {
		editor?.destroy();
	});
</script>

<div class="note-editor" bind:this={editorEl}></div>

<style>
	.note-editor {
		width: 100%;
		min-height: 40px;
		max-height: 200px;
		overflow-y: auto;
	}

	.note-editor :global(.note-editor-content) {
		outline: none;
		font-size: 12px;
		line-height: 1.5;
		color: #d4d4d4;
	}

	.note-editor :global(.note-editor-content p) {
		margin: 0 0 4px;
	}

	.note-editor :global(.note-editor-content h1) {
		font-size: 16px;
		font-weight: 700;
		margin: 0 0 4px;
		color: #e5e5e5;
	}

	.note-editor :global(.note-editor-content h2) {
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 4px;
		color: #e5e5e5;
	}

	.note-editor :global(.note-editor-content h3) {
		font-size: 13px;
		font-weight: 600;
		margin: 0 0 4px;
		color: #e5e5e5;
	}

	.note-editor :global(.note-editor-content ul),
	.note-editor :global(.note-editor-content ol) {
		margin: 0 0 4px;
		padding-left: 16px;
	}

	.note-editor :global(.note-editor-content li) {
		margin: 0;
	}

	.note-editor :global(.note-editor-content code) {
		font-size: 11px;
		background: rgba(255, 255, 255, 0.08);
		padding: 1px 4px;
		border-radius: 3px;
		color: #e879f9;
	}

	.note-editor :global(.note-editor-content pre) {
		font-size: 11px;
		background: rgba(0, 0, 0, 0.3);
		padding: 8px;
		border-radius: 4px;
		margin: 4px 0;
		overflow-x: auto;
	}

	.note-editor :global(.note-editor-content pre code) {
		background: none;
		padding: 0;
	}

	.note-editor :global(.note-editor-content strong) {
		font-weight: 600;
		color: #e5e5e5;
	}

	.note-editor :global(.note-editor-content em) {
		font-style: italic;
	}

	.note-editor :global(.tiptap p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		color: #525252;
		pointer-events: none;
		height: 0;
	}
</style>
