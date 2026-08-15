import LoginForm from "./login-form";

export const metadata = { title: "管理员登录" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5">
      <h1 className="text-2xl font-semibold">管理员登录</h1>
      <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        输入密码后就能修改直播日程
      </p>
      <LoginForm />
    </main>
  );
}
