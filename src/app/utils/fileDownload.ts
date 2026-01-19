import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * Sanitize a filename to be filesystem-safe
 * Removes invalid characters and limits length
 */
export const sanitizeFilename = (name: string): string => {
  // Remove invalid filename characters: / \ : * ? " < > |
  // Replace spaces with hyphens
  // Limit length to 255 characters
  return name
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 255);
};

/**
 * Download a single markdown file
 */
export const downloadMarkdownFile = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(filename)}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Download multiple markdown files as a zip
 */
export const downloadMultipleMarkdownFiles = async (
  components: Array<{ name: string; markdown: string }>
): Promise<void> => {
  const zip = new JSZip();
  const usedFilenames = new Set<string>();

  // Add each component as a separate .md file
  for (const component of components) {
    let filename = sanitizeFilename(component.name);

    // Handle duplicate filenames by appending a number
    let finalFilename = filename;
    let counter = 2;
    while (usedFilenames.has(finalFilename)) {
      finalFilename = `${filename}-${counter}`;
      counter++;
    }
    usedFilenames.add(finalFilename);

    zip.file(`${finalFilename}.md`, component.markdown);
  }

  // Generate and download the zip file
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, 'figma-components-export.zip');
};
