import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"

const paragraphs = [
  "These terms govern your use of the service. By creating an account, you agree to them and to the privacy policy that explains how we handle your data.",
  "You're responsible for the content you upload and for keeping your password safe. Tell us right away if you think someone else has used your account.",
  "We may change the service, and these terms, as the product grows. When a change affects you, we'll let you know by email at least 30 days before it takes effect.",
  "You can stop using the service at any time. We'll keep your data for 30 days after you close your account, so you can export it, and then delete it.",
  "The service is provided as is. To the extent the law allows, we aren't liable for indirect damages, lost profits or lost data.",
  "If you have questions about these terms, write to us. We read every message and reply within two working days.",
]

function Example() {
  return (
    <Dialog>
      <DialogTrigger>Scrollable Content</DialogTrigger>
      <DialogBackdrop />
      <DialogContent initialFocus="content">
        <div data-slot="stack">
          <DialogTitle>Terms of service</DialogTitle>
          <DialogDescription>
            Please read before you continue.
          </DialogDescription>
        </div>
        <div data-slot="scroll">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div data-slot="row">
          <DialogClose>Decline</DialogClose>
          <DialogClose data-variant="solid" value="accept">
            Accept
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { Example }
