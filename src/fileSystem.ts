import * as vscode from "vscode";

export interface FileStat {
  size: number;
}

/** id は URI 文字列 (vscode.Uri.toString())。実装はこれを解決してアクセスする。 */
export interface FileSystem {
  stat(id: string): Promise<FileStat | null>;
  readFile(id: string): Promise<string>;
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
  async rename(fromId: string, toId: string): Promise<void> {
    await vscode.workspace.fs.rename(vscode.Uri.parse(fromId), vscode.Uri.parse(toId), {
      overwrite: true,
    });
  }
  async delete(id: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(vscode.Uri.parse(id), { useTrash: false });
    } catch {
      /* 不在は無害 */
    }
  }
}
