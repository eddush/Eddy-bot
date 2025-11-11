module.exports = {
  name: 'mycommand',
  description: 'שלום',
  execute(message, args, client) {
    message.reply('שלום');
  },
};