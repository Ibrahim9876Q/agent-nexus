import { Store, id } from './db/store.ts';

export function chatTitle(message: string) {
  const title = message.trim().replace(/\s+/g, ' ');
  return title.length > 64 ? title.slice(0, 61) + '…' : title || 'New chat';
}

// Older versions had one conversation per workspace. Preserve that grouping;
// migration never splits old turns/tasks into separate chats or starts work.
export function migrateChats(store: Store) {
  store.transaction(() => {
    for (const project of store.all('projects')) {
      const commands = store
        .all('commands')
        .filter((c) => c.projectId === project.id && !c.chatId);
      const agents = store
        .all('agents')
        .filter((a) => a.projectId === project.id && !a.chatId);
      const tasks = store
        .all('tasks')
        .filter((t) => t.projectId === project.id && !t.chatId);
      if (!commands.length && !agents.length && !tasks.length) continue;
      const existing = store
        .all('chats')
        .find((c) => c.projectId === project.id && c.legacy);
      const first =
        commands.find((c) => c.text.trim().length > 20) || commands[0];
      const chat =
        existing ||
        store.put('chats', {
          id: id(),
          projectId: project.id,
          title: chatTitle(first?.text || project.name),
          createdAt: commands[0]?.at || new Date().toISOString(),
          updatedAt: commands.at(-1)?.at || new Date().toISOString(),
          legacy: true,
        });
      for (const command of commands)
        store.put('commands', { ...command, chatId: chat.id });
      for (const agent of agents)
        store.put('agents', { ...agent, chatId: chat.id });
      for (const task of tasks)
        store.put('tasks', { ...task, chatId: chat.id });
    }
  });
}
