import * as vscode from "vscode";

export interface FileStat {
  size: number;
}

/** id is a URI string (vscode.Uri.toString()). Implementations resolve it to access the resource. */
export interface FileSystem {
  stat(id: string): Promise<FileStat | null>;
  readFile(id: string): Promise<string>;
  writeFile(id: string, content: string): Promise<void>;
  createDirectory(id: string): Promise<void>;
  rename(fromId: string, toId: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export class VSCodeFileSystem implements FileSystem {
  async stat(id: string): Promise<FileStat | null> {
    try {
      const s = await vscode.workspace.fs.stat(vscode.Uri.parse(id));
      return { size: s.size };
    } catch {
      return null;
    }
  }
  async readFile(id: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(id));
    return Buffer.from(bytes).toString("utf8");
  }
  async writeFile(id: string, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(vscode.Uri.parse(id), Buffer.from(content, "utf8"));
  }
  async createDirectory(id: string): Promise<void> {
    // Creates missing parents and is a no-op when the directory already exists.
    await vscode.workspace.fs.createDirectory(vscode.Uri.parse(id));
  }
  async rename(fromId: string, toId: string): Promise<void> {
    await vscode.workspace.fs.rename(vscode.Uri.parse(fromId), vscode.Uri.parse(toId), {
      overwrite: true,
    });
  }
  async delete(id: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(vscode.Uri.parse(id), { useTrash: false });
    } catch {
      /* absent is harmless */
    }
  }
}
