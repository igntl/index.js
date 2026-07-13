const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, MessageFlags } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// إعدادات الغرف (استبدل الأرقام بـ IDs الخاصة بك)
const NOMINATION_CHANNEL_ID = '1483164935436374096'; 
const RESULT_CHANNEL_ID = '1519325101479297176'; 

// الكلمات المفتاحية لرسائل التهنئة والإعلان الإدارية
const EXCLUDE_KEYWORDS = ['ها هو', 'مبروك', 'فاز', 'الفائز', 'تهنئة'];
const MAX_LETTER_LIMIT = 70; 

// 1. تسجيل أمر السلاش
client.once('ready', async () => {
    console.log(`تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('sort')
            .setDescription('فرز وسحب كافة الترشيحات وإرسالها للروم الثاني فوراً')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('جاري تسجيل أمر السلاش (/sort)...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('تم تسجيل أمر السلاش بنجاح وجاهز للاستخدام!');
    } catch (error) {
        console.error('خطأ في تسجيل الأمر:', error);
    }
});

// 2. استقبال وتشغيل أمر السلاش
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sort') {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: 'عذراً، هذا الأمر مخصص للإدارة فقط.', flags: [MessageFlags.Ephemeral] });
        }

        const nominationChannel = client.channels.cache.get(NOMINATION_CHANNEL_ID);
        const resultChannel = client.channels.cache.get(RESULT_CHANNEL_ID);

        if (!nominationChannel || !resultChannel) {
            return interaction.reply({ content: 'خطأ: لم يتم العثور على الغرف المحددة في الكود.', flags: [MessageFlags.Ephemeral] });
        }

        // استخدام النظام الجديد للإخفاء تجنباً للتنبيه في اللوق
        await interaction.reply({ content: '🚀 جاري الفرز السريع والصامت والرفع للروم الثاني...', flags: [MessageFlags.Ephemeral] });

        try {
            const nominationCounts = {};
            let lastMessageId = null;
            let totalFetched = 0;
            let fetchedMessages;
            let lastAdminWhoAnnounced = null;

            // سحب فائق السرعة
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                totalFetched += fetchedMessages.size;
                lastMessageId = fetchedMessages.last().id;

                const messagesArray = Array.from(fetchedMessages.values()).reverse();

                for (const msg of messagesArray) {
                    if (msg.author.bot) continue;

                    const contentText = msg.content.toLowerCase();
                    const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(k => contentText.includes(k));

                    if (contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword) {
                        lastAdminWhoAnnounced = msg.author.id;
                        continue;
                    }

                    if (lastAdminWhoAnnounced && msg.author.id === lastAdminWhoAnnounced && msg.mentions.users.size > 0) {
                        lastAdminWhoAnnounced = null;
                        continue;
                    }

                    if (lastAdminWhoAnnounced && msg.author.id !== lastAdminWhoAnnounced) {
                        lastAdminWhoAnnounced = null;
                    }

                    msg.mentions.users.forEach(user => {
                        if (!user.bot) {
                            nominationCounts[user.id] = (nominationCounts[user.id] || 0) + 1;
                        }
                    });
                }

            } while (fetchedMessages.size === 100);

            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى الفرز ولم يتم العثور على ترشيحات صالحة.');
            }

            // بناء اللستة المقاومة للمجتمعات الكبيرة
            const embed = new EmbedBuilder()
                .setTitle('📊 اللستة النهائية لفرز الترشيحات الموحدة')
                .setDescription(`تم فحص **${totalFetched}** رسالة بنجاح ونزع منشنات التهنئة الإدارية تلقائياً.`)
                .setColor('#2efc03')
                .setTimestamp();

            let currentFieldText = '';
            let fieldCount = 1;

            sortedNominees.forEach(([userId, count], index) => {
                const line = `**#${index + 1}** | <@${userId}> ➔ **${count}** صوت\n`;
                
                // إذا أضاف السطر الحالي وتخطى الحقل 950 حرفاً (لحمايته من حد الـ 1024)
                if ((currentFieldText + line).length > 950) {
                    embed.addFields({ name: `قائمة الترتيب - الجزء ${fieldCount}`, value: currentFieldText });
                    currentFieldText = line; // تفريغ النص للبدء بحقل جديد
                    fieldCount++;
                } else {
                    currentFieldText += line;
                }
            });

            // إضافة آخر نص متبقي في الحلقة التكرارية
            if (currentFieldText.length > 0) {
                embed.addFields({ name: `قائمة الترتيب - الجزء ${fieldCount}`, value: currentFieldText });
            }

            // إرسال النتيجة في الروم الثاني فوراً
            await resultChannel.send({ embeds: [embed] });

        } catch (error) {
            console.error('حدث خطأ أثناء الفرز السريع:', error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
