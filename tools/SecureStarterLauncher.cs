using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Reflection;

internal static class SecureStarterLauncher
{
    private static int Main(string[] args)
    {
        string folder = AppDomain.CurrentDomain.BaseDirectory;

        string executable = Path.GetFileNameWithoutExtension(
            Assembly.GetExecutingAssembly().Location
        ).ToUpperInvariant();

        if (executable != "SETUP" && executable != "STARTER" && executable != "STOP")
        {
            Console.Error.WriteLine("Invalid launcher name.");
            return 2;
        }

        string script = Path.Combine(
            folder,
            "SECURE-LIFECYCLE.ps1"
        );

        if (!File.Exists(script))
        {
            Console.Error.WriteLine(
                "SECURE-LIFECYCLE.ps1 not found."
            );

            return 3;
        }

        string powershell = Path.Combine(
            Environment.GetFolderPath(
                Environment.SpecialFolder.System
            ),
            @"WindowsPowerShell\v1.0\powershell.exe"
        );

        if (!File.Exists(powershell))
        {
            Console.Error.WriteLine(
                "Windows PowerShell not found."
            );

            return 4;
        }

        try
        {
            ProcessStartInfo info = new ProcessStartInfo();

            info.FileName = powershell;

            info.Arguments =
                "-NoLogo -NoProfile -NonInteractive " +
                "-ExecutionPolicy Bypass " +
                "-File \"" + script + "\" " +
                "-Action " + executable;

            info.WorkingDirectory = folder;

            info.UseShellExecute = false;

            info.CreateNoWindow = true;

            using (Process child = Process.Start(info))
            {
                if (child == null)
                {
                    throw new Exception(
                        "PowerShell process start failed."
                    );
                }

                child.WaitForExit();

                return child.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.ToString());

            try
            {
                string stateDir = Path.Combine(
                    folder,
                    ".starter-state"
                );

                Directory.CreateDirectory(stateDir);

                string log = Path.Combine(
                    stateDir,
                    "launcher-error.log"
                );

                File.AppendAllText(
                    log,
                    DateTime.Now.ToString("o") +
                    " " + executable +
                    Environment.NewLine +
                    ex.ToString() +
                    Environment.NewLine,
                    Encoding.UTF8
                );
            }
            catch
            {
                // Logging failure must not hide the original error.
            }

            return 1;
        }
    }
}

