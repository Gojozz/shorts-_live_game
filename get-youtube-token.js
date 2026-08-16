const { google } = require("googleapis");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

(async () => {
  try {
    const clientId = await ask("Client ID: ");
    const clientSecret = await ask("Client Secret: ");

    const oauth2Client = new google.auth.OAuth2(
      clientId.trim(),
      clientSecret.trim(),
      "http://localhost:3000/oauth2callback"
    );

    const scopes = [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl"
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes
    });

    console.log("\n=== BUKA URL INI DI BROWSER ===\n");
    console.log(authUrl);
    console.log("\nSetelah menyetujui akses, Google akan mengarahkan ke localhost.");
    console.log("Jika halaman tidak terbuka, salin URL halaman tersebut.");
    console.log("Cari parameter 'code=' pada URL.\n");

    const code = await ask("Authorization code: ");

    const { tokens } = await oauth2Client.getToken(code.trim());

    console.log("\nOAuth berhasil.");
    console.log("Refresh token berhasil diperoleh.");
    console.log("\nJANGAN KIRIM TOKEN INI KE CHAT.");
    console.log("Masukkan nilainya ke GitHub Secret: YOUTUBE_REFRESH_TOKEN\n");
    console.log(tokens.refresh_token);

  } catch (error) {
    console.error("\nOAuth gagal:");
    console.error(error.response?.data || error.message);
  } finally {
    rl.close();
  }
})();
