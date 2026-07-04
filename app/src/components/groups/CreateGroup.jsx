import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { truncateAddress } from "@/utils/formatting";
import { Users, X, Plus, Loader2 } from "lucide-react";

/**
 * CreateGroup — modal for creating new group chats.
 */
export function CreateGroup({ isOpen, onClose, contacts, onCreate }) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  const filteredContacts = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.username?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  });

  const toggleMember = (contact) => {
    setSelected((prev) => {
      const exists = prev.find((m) => m.address === contact.address);
      if (exists) return prev.filter((m) => m.address !== contact.address);
      return [...prev, contact];
    });
  };

  const handleCreate = async () => {
    if (!name.trim() || selected.length === 0) return;
    setIsCreating(true);
    try {
      await onCreate?.(name.trim(), selected.map((s) => s.address));
      setName("");
      setSelected([]);
      setSearch("");
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = name.trim().length > 0 && selected.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Group" size="md">
      <div className="flex flex-col gap-4">
        {/* Group name */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Group Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter group name..."
            className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border border-transparent focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>

        {/* Search members */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Add Members ({selected.length})
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border border-transparent focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all mb-2"
          />

          {/* Selected members */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selected.map((member) => (
                <span
                  key={member.address}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
                >
                  {member.username || truncateAddress(member.address)}
                  <button
                    onClick={() => toggleMember(member)}
                    className="hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Contact list */}
          <div className="max-h-[200px] overflow-y-auto border border-border rounded-lg">
            {filteredContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No contacts found
              </p>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selected.some(
                  (m) => m.address === contact.address
                );
                return (
                  <button
                    key={contact.address}
                    onClick={() => toggleMember(contact)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted transition-colors ${
                      isSelected ? "bg-primary/5" : ""
                    }`}
                  >
                    <Avatar
                      address={contact.address}
                      username={contact.username}
                      size="sm"
                    />
                    <span className="text-sm flex-1">
                      {contact.username || truncateAddress(contact.address)}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground"
                      }`}
                    >
                      {isSelected && <Plus className="w-3 h-3 text-primary-foreground" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || isCreating}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            {isCreating ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
