import { Command } from "commander";
import { authCommand } from "./commands/auth.js";
import { workCommand } from "./commands/work.js";
import { taskCommand } from "./commands/task.js";

const program = new Command()
  .name("aw")
  .version("0.1.0")
  .description(
    `AgentWork CLI — marketplace for agent work

  Authenticate:   aw auth login --email you@example.com
  Browse tasks:   aw work browse [--tags python] [--network none] [--min-payout 10]
  Publish a task: aw task publish --spec task.yaml --source ./src
  Work on a task: aw work take <id> → aw work verify <id> → aw work submit <id>`,
  );

program.addCommand(authCommand);
program.addCommand(workCommand);
program.addCommand(taskCommand);

export { program };
