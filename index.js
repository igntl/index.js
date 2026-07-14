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

        await interaction.reply({ content: '🚀 جاري جلب كافة الأصوات بدقة متناهية (كل المنشنات الفردية والمتعددة)...', flags: [MessageFlags.Ephemeral] });

        try {
            const nominationCounts = {};
            let lastMessageId = null;
            let fetchedMessages;
            let lastAdminWhoAnnounced = null;
            let totalFetched = 0;

            // 1. حلقة تكرارية لسحب كامل سجل الروم
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                totalFetched += fetchedMessages.size;
                lastMessageId = fetchedMessages.last().id;
                const messagesArray = Array.from(fetchedMessages.values()).reverse();

                // 2. الفرز الذكي والتفصيلي لكل رسالة
                for (const msg of messagesArray) {
                    if (msg.author.bot) continue;

                    const contentText = msg.content.toLowerCase();
                    const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(k => contentText.includes(k));

                    // الفحص الأول: هل الرسالة تهنئة أو إعلان؟
                    if (contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword) {
                        lastAdminWhoAnnounced = msg.author.id; // سجلنا الإداري الذي أعلن
                        continue; // تخطي رسالة التهنئة بالكامل
                    }

                    // الحصول على جميع المنشنات الفريدة داخل الرسالة كقائمة (Array)
                    const mentionsList = Array.from(msg.mentions.users.values()).filter(user => !user.bot);

                    if (mentionsList.length === 0) continue; // رسالة بدون منشنات

                    // الفحص الثاني: استبعاد المنشن الإداري المباشر الأول (منشن الفائز) فقط
                    if (lastAdminWhoAnnounced && msg.author.id === lastAdminWhoAnnounced) {
                        // نقوم بحذف المنشن الأول فقط من القائمة (منشن الفائز المستبعد)
                        mentionsList.shift(); 
                        lastAdminWhoAnnounced = null; // إنهاء حالة الترقب للإداري فوراً بعد فلترة الفائز
                    }

                    // احتساب بقية المنشنات في الرسالة بدقة (سواء كانت منشن واحد، 3، أو أكثر تحت بعض)
                    mentionsList.forEach(user => {
                        nominationCounts[user.id] = (nominationCounts[user.id] || 0) + 1;
                    });
                }

            } while (fetchedMessages.size === 100);

            // ترتيب تنازلي للأصوات
            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى سحب الروم ولم يتم العثور على ترشيحات صالحة.');
            }

            // 3. كتابة النتيجة وإرسالها كرسائل نصية طبيعية
            let currentMessageText = `📋 **اللستة النهائية الشاملة للترشيحات الموحدة (تم فحص ${totalFetched} رسالة بالتاريخ بدقة للأصوات الفردية والمتعددة):**\n\n`;

            for (let index = 0; index < sortedNominees.length; index++) {
                const [userId, count] = sortedNominees[index];
                const line = `**#${index + 1}** | <@${userId}> ➔ **${count}** صوت\n`;

                if ((currentMessageText + line).length > 1800) {
                    await resultChannel.send({ content: currentMessageText });
                    currentMessageText = line; 
                } else {
                    currentMessageText += line;
                }
            }

            if (currentMessageText.length > 0) {
                await resultChannel.send({ content: currentMessageText });
            }

        } catch (error) {
            console.error('حدث خطأ أثناء المعالجة الشاملة للروم:', error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
