import chalk from "chalk";
import boxen from "boxen";
import ora, { type Ora } from "ora";
import { config } from "../config.ts";

export function printBanner(): void {
  const title = chalk.bold.hex("#00C2FF")("⚡ Instantly  →  HubSpot Sync");

  const flag = (label: string, on: boolean) =>
    `${chalk.dim(label + ":")} ${on ? chalk.greenBright("on") : chalk.red("off")}`;

  const flags = [
    chalk.dim("port:") + " " + chalk.white(config.port),
    flag("sync", config.syncEnabled),
    flag("poller", config.pollEnabled),
  ].join(chalk.dim("   ·   "));

  console.log(
    boxen(`${title}\n\n${flags}`, {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: { top: 1, bottom: 1, left: 1, right: 0 },
      borderStyle: "round",
      borderColor: "cyan",
    })
  );
}

export async function step<T>(
  label: string,
  fn: () => Promise<T>,
  successLabel?: (result: T) => string
): Promise<T> {
  const spinner: Ora = ora({ text: chalk.dim(label), color: "cyan" }).start();
  try {
    const result = await fn();
    spinner.succeed(chalk.dim(successLabel ? successLabel(result) : label));
    return result;
  } catch (err) {
    spinner.fail(chalk.red(label));
    throw err;
  }
}

export function stepSync(label: string, fn: () => void): void {
  const spinner: Ora = ora({ text: chalk.dim(label), color: "cyan" }).start();
  try {
    fn();
    spinner.succeed(chalk.dim(label));
  } catch (err) {
    spinner.fail(chalk.red(label));
    throw err;
  }
}
