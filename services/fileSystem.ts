import { FileWithHandle, ProcessedFile } from '../types';

/**
 * Recursively reads a directory handle to find allowed files.
 */
export const getFilesRecursively = async (
  dirHandle: FileSystemDirectoryHandle,
  path = ''
): Promise<FileWithHandle[]> => {
  const files: FileWithHandle[] = [];
  const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp'];

  for await (const entry of dirHandle.values()) {
    const currentPath = path ? `${path}/${entry.name}` : entry.name;
    
    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle;
      const extension = entry.name.split('.').pop()?.toLowerCase();
      if (extension && allowedExtensions.includes(extension)) {
        const file = await fileHandle.getFile();
        files.push({
          file,
          handle: fileHandle,
          path: currentPath,
        });
      }
    } else if (entry.kind === 'directory') {
      const subDirHandle = entry as FileSystemDirectoryHandle;
      const subFiles = await getFilesRecursively(subDirHandle, currentPath);
      files.push(...subFiles);
    }
  }
  return files;
};

/**
 * Organizes files into the destination folder structure.
 */
export const organizeFilesToDestination = async (
  processedFiles: ProcessedFile[],
  destinationHandle: FileSystemDirectoryHandle,
  onProgress: (current: number, total: number, filename: string) => void
) => {
  let count = 0;
  const total = processedFiles.length;

  for (const item of processedFiles) {
    onProgress(count + 1, total, item.file.name);
    
    // Determine folder name (Year or "Unknown")
    const folderName = item.detectedYear === 'Unknown' 
      ? 'Unknown_Date' 
      : String(item.detectedYear);

    try {
      // Get or Create Year Directory
      const yearDirHandle = await destinationHandle.getDirectoryHandle(folderName, { create: true });
      
      // Create File in Destination
      // We keep the original filename. If duplicates exist, we might overwrite or fail 
      // depending on browser implementation, but standard FSA API overwrites by default with create: true
      const newFileHandle = await yearDirHandle.getFileHandle(item.file.name, { create: true });
      const writable = await newFileHandle.createWritable();
      
      await writable.write(item.file);
      await writable.close();
      
    } catch (error) {
      console.error(`Failed to copy ${item.file.name}`, error);
    }
    count++;
  }
};