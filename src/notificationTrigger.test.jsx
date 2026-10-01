import { fireEvent, render, screen } from "@testing-library/react";
import NotificationTrigger from "./components/common/NotificationTrigger";

test("renders an accessible bell trigger with the unread count and preserves interaction", () => {
  const onClick = jest.fn();
  const { container } = render(
    <NotificationTrigger className="pillBtn" unreadCount={3} onClick={onClick} />
  );

  const trigger = screen.getByRole("button", { name: "Notifications, 3 unread" });
  expect(trigger).toHaveClass("pillBtn", "notifTriggerButton");
  expect(trigger).toHaveTextContent("(3)");
  expect(trigger).not.toHaveTextContent("Notifications");
  expect(container.querySelector(".notifTriggerIcon")).toBeInTheDocument();
  expect(container.querySelector(".notifTriggerDot")).toBeInTheDocument();

  fireEvent.click(trigger);
  expect(onClick).toHaveBeenCalledTimes(1);
});
