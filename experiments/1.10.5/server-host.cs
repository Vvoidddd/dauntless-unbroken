using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class TestRealmHost {
    [STAThread]
    static void Main() {
        var root = AppDomain.CurrentDomain.BaseDirectory;
        var script = Path.Combine(root, "repo", "experiments", "1.10.5", "start-realm.ps1");
        try {
            if (!File.Exists(script)) throw new Exception("Keep this host starter in the local 1.10.5 test folder.");
            var powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
            var start = new ProcessStartInfo(powershell, "-NoProfile -NonInteractive -File \"" + script + "\"") {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true,
                WorkingDirectory = Path.GetDirectoryName(script)
            };
            start.EnvironmentVariables["PSModulePath"] = Path.Combine(Path.GetDirectoryName(powershell), "Modules");
            using (var process = Process.Start(start)) {
                var errors = process.StandardError.ReadToEndAsync();
                var output = process.StandardOutput.ReadToEnd();
                process.WaitForExit();
                File.WriteAllText(Path.Combine(root, "host-start.log"), output + errors.Result);
                if (process.ExitCode != 0) throw new Exception("The test realm could not start. See host-start.log.\n\n" + errors.Result);
            }
        } catch (Exception error) {
            MessageBox.Show(error.Message, "Unbroken 1.10.5 test host", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
