import type { CodyCommand, ContextFile } from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import { ASK_QUESTION_COMMAND, EDIT_COMMAND } from '../menus/items'
import { CustomCommandsManager } from './custom-commands'
import { showCommandMenu } from '../menus'
import { getContextFileFromShell } from '../context/shell'
import { getDefaultCommandsMap } from '../utils/get-commands'

const editorCommands: CodyCommand[] = [
    {
        description: ASK_QUESTION_COMMAND.description,
        prompt: ASK_QUESTION_COMMAND.slashCommand,
        slashCommand: ASK_QUESTION_COMMAND.slashCommand,
        mode: 'ask',
        type: 'default',
    },
    {
        description: EDIT_COMMAND.description,
        prompt: EDIT_COMMAND.slashCommand,
        slashCommand: EDIT_COMMAND.slashCommand,
        mode: 'edit',
        type: 'default',
    },
]

export const vscodeDefaultCommands = getDefaultCommandsMap(editorCommands)

/**
 * Provides management and interaction capabilities for both default and custom Cody commands.
 *
 * It is responsible for initializing, grouping, and refreshing command sets,
 * as well as handling command menus and execution.
 */
export class CommandsProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    protected readonly defaultCommands = vscodeDefaultCommands
    protected customCommandsStore = new CustomCommandsManager()

    // The commands grouped with default commands and custom commands
    private allCommands = new Map<string, CodyCommand>()

    constructor() {
        this.disposables.push(this.customCommandsStore)
        // adds the default commands to the all commands map
        this.groupCommands(this.defaultCommands)

        // Cody Command Menus
        this.disposables.push(
            vscode.commands.registerCommand('cody.menu.commands', () => this?.menu('default')),
            vscode.commands.registerCommand('cody.menu.custom-commands', () => this?.menu('custom')),
            vscode.commands.registerCommand('cody.menu.commands-settings', () => this?.menu('config'))
        )

        this.customCommandsStore.init()
    }

    private async menu(type: 'custom' | 'config' | 'default'): Promise<void> {
        const customCommands = await this.getCustomCommands()
        const commandArray = [...customCommands].map(command => command[1])
        await showCommandMenu(type, commandArray)
    }

    /**
     * Find a command by its id
     */
    public get(id: string): CodyCommand | undefined {
        return this.allCommands.get(id)
    }

    protected async getCustomCommands(): Promise<Map<string, CodyCommand>> {
        const { commands } = await this.customCommandsStore.refresh()
        this.groupCommands(commands)
        return commands
    }

    /**
     * Group the default commands with the custom commands and add a separator
     */
    protected groupCommands(customCommands = new Map<string, CodyCommand>()): void {
        const defaultCommands = [...this.defaultCommands]
        const combinedMap = new Map([...defaultCommands])
        // Add the custom commands to the all commands map
        this.allCommands = new Map([...customCommands, ...combinedMap].sort())
    }

    /**
     * Refresh the custom commands from store before combining with default commands
     */
    protected async refresh(): Promise<void> {
        const { commands } = await this.customCommandsStore.refresh()
        this.groupCommands(commands)
    }

    /**
     * Gets the context file content from executing a shell command.
     * Used for retreiving context for the command field in custom command
     */
    public async runShell(shell: string): Promise<ContextFile[]> {
        return getContextFileFromShell(shell)
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
