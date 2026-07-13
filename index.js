const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, MessageFlags } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// إعدادات الغرف الخاصة بك (ثابتة ومباشرة)
const NOMINATION_CHANNEL_ID = '1483164935436374096'; 
const RESULT_CHANNEL_ID = '1519325101479297176';     

// الكلمات المفتاحية لرسائل التهنئة والإعلان الإدارية
const EXCLUDE_KEYWORDS = ['ها هو', 'مبروك', 'فاز', 'الفائز', 'تهنئة'];
const MAX_LETTER_LIMIT = 70; 

// استخدام clientReady لتفادي الـ Warning الخاص بـ ديسكورد
client.once('clientReady', async () => {
    console.log(`تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('sort')
            .setDescription('سحب كافة الترشيحات التاريخية ونقلها لشات النتائج فوراً')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('تم تسجيل أمر السلاش بنجاح وجاهز للاستخدام!');
    } catch (error) {
        console.error('خطأ في تسجيل الأمر:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sort') {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: 'عذراً، هذا الأمر مخصص للإدارة فقط.', flags: [MessageFlags.Ephemeral] });
        }

        const nominationChannel = client.channels.cache.get(NOMINATION_CHANNEL_ID);
        const resultChannel = client.channels.cache.get(RESULT_CHANNEL_ID);

        if (!nominationChannel || !resultChannel) {
            return interaction.reply({ content: 'خطأ: لم يتم العثور على الغرف المحددة.', flags: [MessageFlags.Ephemeral] });
        }

        // رد مخفي فوري للإداري يوضح بدء العملية
        await interaction.reply({ content: '🚀 جاري سحب الروم كاملاً بالخلفية ونقل النتائج رسائل نصية طبيعية...', flags: [MessageFlags.Ephemeral] });

        try {
            const nominationCounts = {};
            let lastMessageId = null;
            let fetchedMessages;
            let lastAdminWhoAnnounced = null;
            let totalFetched = 0;

            // 1. حلقة تكرارية تسحب الروم كاملاً مهما بلغ عدد الرسائل
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                totalFetched += fetchedMessages.size;
                lastMessageId = fetchedMessages.last().id;
                const messagesArray = Array.from(fetchedMessages.values()).reverse();

                // 2. الفرز الذكي واستبعاد التهنئة ومنشن الفائز المباشر يليها
                for (const msg of messagesArray) {
                    if (msg.author.bot) continue;

                    const contentText = msg.content.toLowerCase();
                    const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(k => contentText.includes(k));

                    // تخطي رسائل التهنئة (تبدأ بها هو، مبروك، أو رسالة طويلة)
                    if (contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword) {
                        lastAdminWhoAnnounced = msg.author.id;
                        continue;
                    }

                    // تخطي منشن الفائز الذي يرسله نفس الإداري بعد التهنئة مباشرة
                    if (lastAdminWhoAnnounced && msg.author.id === lastAdminWhoAnnounced && msg.mentions.users.size > 0) {
                        lastAdminWhoAnnounced = null;
                        continue;
                    }

                    if (lastAdminWhoAnnounced && msg.author.id !== lastAdminWhoAnnounced) {
                        lastAdminWhoAnnounced = null;
                    }

                    // احتساب الترشيحات الحقيقية المتبقية
                    msg.mentions.users.forEach(user => {
                        if (!user.bot) {
                            nominationCounts[user.id] = (nominationCounts[user.id] || 0) + 1;
                        }
                    });
                }

            } while (fetchedMessages.size === 100);

            // ترتيب النتيجة تنازلياً من الأعلى تصويتاً للأقل
            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى سحب الروم ولم يتم العثور على ترشيحات صالحة بعد التصفية.');
            }

            // 3. بناء اللستة وإرسالها رسائل نصية طبيعية بالكامل
            let currentMessageText = `📋 **اللستة النهائية والكاملة للترشيحات الموحدة (تم فحص ${totalFetched} رسالة بالتاريخ):**\n\n`;

            for (let index = 0; index < sortedNominees.length; index++) {
                const [userId, count] = sortedNominees[index];
                const line = `**#${index + 1}** | <@${userId}> ➔ **${count}** صوت\n`;

                // ديسكورد يسمح بـ 2000 حرف كحد أقصى للرسالة النصية العادية، نقوم بالتقسيم عند 1800 حرف تلقائياً لمنع أي مشكلة
                if ((currentMessageText + line).length > 1800) {
                    await resultChannel.send({ content: currentMessageText });
                    currentMessageText = line; // بدء رسالة نصية ثانية للباقين
                } else {
                    currentMessageText += line;
                }
            }

            // إرسال الجزء المتبقي والأخير من النص
            if (currentMessageText.length > 0) {
                await resultChannel.send({ content: currentMessageText });
            }

        } catch (error) {
            console.error('حدث خطأ أثناء المعالجة الشاملة للروم:', error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
