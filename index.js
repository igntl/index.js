const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
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
const VOICE_CHANNEL_ID = '1483220557796479098'; // تم تحديث آيدي الروم الخاص بك
const PREFIX = '!'; // بريفكس أوامر الأغاني (مثال: !play)
// =======================================================

// إعداد مشغل الموسيقى (DisTube)
const distube = new DisTube(client, {
    leaveOnStop: false,
    leaveOnEmpty: false,
    leaveOnFinish: false, // لضمان عدم خروج البوت من الروم الصوتي أبداً
    plugins: [
        new YouTubePlugin(),
        new SpotifyPlugin(),
        new SoundCloudPlugin()
    ]
});

client.once('ready', async () => {
    console.log(`🎵 Bot is ready as ${client.user.tag}!`);
    
    // البقاء في الروم الصوتي 24/7 عند تشغيل البوت
    connectToVoice();
});

// دالة دخول الروم الصوتي والثبات فيه
async function connectToVoice() {
    try {
        const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
        if (!channel) return console.error("لم يتم العثور على الروم الصوتي.");

        // الدخول إلى الروم باستخدام DisTube وضمان ثباته
        await distube.voices.join(channel);
        console.log(`✅ Connected and staying in: ${channel.name}`);
    } catch (error) {
        console.error("خطأ أثناء الاتصال بالروم الصوتي:", error);
        // إعادة المحاولة بعد 5 ثوانٍ في حال فشل الاتصال المفاجئ
        setTimeout(() => connectToVoice(), 5000);
    }
}

// التحكم في الأوامر
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    // تم تصحيح هذا السطر لمنع كراش الـ SyntaxError العشوائي
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. أمر التشغيل (!play أو !p)
    if (command === 'play' || command === 'p') {
        const query = args.join(' ');
        if (!query) return message.reply('❌ يرجى كتابة اسم الأغنية أو الرابط!');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('❌ يجب أن تكون في روم صوتي أولاً!');

        await message.reply(`🔍 جاري البحث والتشغيل: **${query}**...`);
        
        try {
            // تشغيل الأغنية في الروم الصوتي المتواجد فيه المستخدم
            await distube.play(voiceChannel, query, {
                message,
                textChannel: message.channel
            });
        } catch (error) {
            console.error(error);
            message.channel.send('❌ حدث خطأ أثناء محاولة تشغيل الأغنية.');
        }
    }

    // 2. أمر التخطي (!skip أو !s)
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

    // 3. أمر إيقاف الموسيقى مؤقتاً (!stop)
    if (command === 'stop') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('❌ لا توجد موسيقى تعمل حالياً.');
        
        await distube.stop(message);
        message.reply('⏹️ تم إيقاف التشغيل وتصفير قائمة الانتظار (البوت سيبقى في الروم).');
    }

    // 4. أمر معرفة الأغنية الحالية (!nowplaying أو !np)
    if (command === 'np' || command === 'nowplaying') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('❌ لا يوجد شيء يعمل حالياً.');
        
        const song = queue.songs[0];
        message.reply(`🎶 تعمل حالياً: **${song.name}** - \`${song.formattedDuration}\`\nطلب بواسطة: ${song.user}`);
    }
});

// أحداث مشغل الموسيقى لإرسال رسائل تفاعلية عند تشغيل الأغاني
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

// حماية إضافية: إذا خرج البوت بالخطأ أو طُرد، يعود تلقائياً
client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.member.id === client.user.id && !newState.channelId) {
        console.log("⚠️ تم إخراج البوت من الروم الصوتي! جاري العودة...");
        setTimeout(() => connectToVoice(), 3000);
    }
});

client.login(process.env.DISCORD_TOKEN);
