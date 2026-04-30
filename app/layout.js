export const metadata = {
  title: 'SplitBill — fair splits, zero drama',
  description: 'Split restaurant bills fairly with AI receipt scanning',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
