const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const ffmpegStatic = require('ffmpeg-static'); // استدعاء المسار الثابت للمكتبة المرفقة بالمشروع
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ==================== [ الإعدادات ] ====================
const VOICE_CHANNEL_ID = '1483220557796479098'; 
const PREFIX = '!'; 
// =======================================================

// إعداد ديس تيوب وتمرير المسار التنفيذي الثابت والمباشر للمكتبة داخل المشروع
const distube = new DisTube(client, {
    ffmpeg: {
        path: ffmpegStatic // الحل النهائي: تمرير المسار البرمجي المباشر للحزمة الثابتة
    },
    plugins: [
        new YouTubePlugin({ 
            ytdlOptions: {
                highWaterMark: 1 << 25,
                filter: 'audioonly',
                quality: 'highestaudio'
            }
        }),
        new SpotifyPlugin(),
        new SoundCloudPlugin()
    ]
});

client.once('clientReady', async () => {
    console.log(`🎵 Bot is ready as ${client.user.tag}!`);
    setTimeout(() => connectToVoice(), 3000);
});

async function connectToVoice() {
    try {
        const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
        if (!channel) return console.error("لم يتم العثور على الروم الصوتي.");

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfMute: false,
            selfDeaf: true
        });

        distube.voices.add(channel.guild.id, connection);

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            console.log("⚠️ تم قطع الاتصال بالروم، جاري إعادة المحاولة...");
            setTimeout(() => connectToVoice(), 5000);
        });

        console.log(`✅ Connected and stable in: ${channel.name}`);
    } catch (error) {
        console.error("خطأ أثناء الاتصال بالروم الصوتي:", error);
        setTimeout(() => connectToVoice(), 5000);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        const query = args.join(' ');
        if (!query) return message.reply('❌ يرجى كتابة اسم الأغنية أو الرابط!');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('❌ يجب أن تكون في روم صوتي أولاً!');

        const replyMessage = await message.reply(`🔍 جاري البحث والتشغيل: **${query}**...`);
        
        try {
            await distube.play(voiceChannel, query, {
                message: message,
                textChannel: message.channel,
                member: message.member
            });
            await replyMessage.delete().catch(() => {});
        } catch (error) {
            console.error("DISTUBE PLAY ERROR:", error);
            await replyMessage.edit('❌ حدث خطأ أثناء محاولة تشغيل الأغنية.');
        }
    }

    if (command === 'skip' || command === 's') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('❌ لا توجد أغاني شغال حالياً في القائمة!');
        try {
            await distube.skip(message);
            message.reply('⏭️ تم تخطي الأغنية الحالية.');
        } catch (e) {
            message.reply('❌ لا توجد أغنية تالية لتخطيها.');
        }
    }

    if (command === 'stop') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('❌ لا توجد موسيقى تعمل حالياً.');
        await distube.stop(message);
        message.reply('⏹️ تم إيقاف التشغيل وتصفير القائمة.');
    }

    if (command === 'np' || command === 'nowplaying') {
        const queue = distube.getQueue(message);
        if (!queue || !queue.songs.length) return message.reply('❌ لا يوجد شيء يعمل حالياً.');
        const song = queue.songs[0];
        message.reply(`🎶 تعمل حالياً: **${song.name}** - \`${song.formattedDuration}\``);
    }
});

distube.on('playSong', (queue, song) => {
    const embed = new EmbedBuilder()
        .setTitle('🎶 جاري تشغيل الأغنية الآن')
        .setDescription(`**[${song.name}](${song.url})**`)
        .addFields(
            { name: 'المدة', value: `\`${song.formattedDuration}\``, inline: true },
            { name: 'بواسطة', value: `${song.user}`, inline: true }
        )
        .setThumbnail(song.thumbnail)
        .setColor('#00ff00');
    
    queue.textChannel.send({ embeds: [embed] });
});

distube.on('error', (channel, e) => {
    console.error("DisTube Global Error:", e);
});

client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.member.id === client.user.id && !newState.channelId) {
        console.log("⚠️ تم خروج البوت من الروم! جاري إعادته للثبات...");
        setTimeout(() => connectToVoice(), 5000);
    }
});

client.login(process.env.DISCORD_TOKEN);
