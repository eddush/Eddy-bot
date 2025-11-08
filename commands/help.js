module.exports = {
  name: 'help',
  description: 'מציג את רשימת הפקודות הזמינות',
  execute(message, args, client) {
    const commands = client.commands;
    
    let helpMessage = '📚 **רשימת פקודות זמינות:**\n\n';
    
    commands.forEach(command => {
      helpMessage += `\`!${command.name}\` - ${command.description}\n`;
    });
    
    helpMessage += '\n💡 לשימוש בפקודה: !<שם הפקודה>';
    
    message.reply(helpMessage);
  },
};
