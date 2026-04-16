import { execa, type Options as ExecaOptions } from "execa";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function run(
  command: string,
  args: string[],
  options?: ExecaOptions
): Promise<RunResult> {
  try {
    const result = await execa(command, args, {
      timeout: 120_000,
      ...options,
    });
    return {
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      exitCode: result.exitCode ?? 0,
    };
  } catch (error: any) {
    return {
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? error.message ?? String(error)),
      exitCode: error.exitCode ?? 1,
    };
  }
}

export async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execa("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}
