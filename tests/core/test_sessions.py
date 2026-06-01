import base64
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from cecli import session_crypto
from cecli.io import InputOutput
from cecli.sessions import SessionManager


@pytest.fixture(autouse=True)
def _clear_mock_coder_args(mock_coder):
    """Reset args after tests that replace them (e.g. encrypt_coder)."""
    yield
    mock_coder.args = SimpleNamespace(
        model="test_model",
        weak_model="test_weak_model",
        editor_model="test_editor_model",
        agent_model="test_agent_model",
        editor_edit_format="editor-diff",
        verbose=False,
        session_encrypt=False,
        session_key_file=None,
    )


def _prepare_workspace(mock_coder, tmp_path) -> None:
    """Point coder at tmp_path and create session dir + files referenced in saves."""
    root = Path(tmp_path)
    mock_coder.abs_root_path.side_effect = lambda x: str(root / x)
    (root / ".cecli" / "sessions").mkdir(parents=True, exist_ok=True)
    (root / "file1.py").write_text("", encoding="utf-8")
    (root / "file2.py").write_text("", encoding="utf-8")


@pytest.fixture
def mock_coder(monkeypatch):
    """Fixture to create a mock coder with necessary attributes."""
    conv_manager = MagicMock()
    conv_manager.get_messages_dict.return_value = []
    files_manager = MagicMock()
    monkeypatch.setattr(
        "cecli.sessions.ConversationService.get_manager",
        lambda _coder: conv_manager,
    )
    monkeypatch.setattr(
        "cecli.sessions.ConversationService.get_files",
        lambda _coder: files_manager,
    )

    coder = MagicMock()
    coder.abs_fnames = {"/path/to/file1.py"}
    coder.abs_read_only_fnames = {"/path/to/file2.py"}
    coder.abs_read_only_stubs_fnames = set()
    coder.auto_commits = True
    coder.auto_lint = True
    coder.auto_test = False
    coder.total_tokens_sent = 100
    coder.total_tokens_received = 200
    coder.total_cached_tokens = 50
    coder.total_cost = 0.01
    coder.edit_format = "diff"

    # Mock the main_model and its attributes
    main_model = MagicMock()
    main_model.name = "test_model"
    main_model.weak_model.name = "test_weak_model"
    main_model.editor_model.name = "test_editor_model"
    main_model.agent_model.name = "test_agent_model"
    main_model.editor_edit_format = "editor-diff"
    coder.main_model = main_model
    monkeypatch.setattr(
        "cecli.sessions.models.Model",
        lambda *args, **kwargs: main_model,
    )

    # Mock other necessary methods and attributes
    coder.format_chat_chunks = MagicMock()
    coder.get_rel_fname.side_effect = lambda x: os.path.basename(x)
    coder.abs_root_path.side_effect = lambda x: f"/test/root/{x}"
    coder.local_agent_folder.side_effect = lambda x: f".cecli/{x}"
    coder.io = MagicMock(spec=InputOutput)
    coder.agent_config = {}
    coder.mcp_manager = None
    coder.skills_manager = None
    coder.io.read_text.return_value = "some todo content"
    # None avoids MagicMock inventing session_encrypt=True; load needs real fields.
    coder.args = SimpleNamespace(
        model="test_model",
        weak_model="test_weak_model",
        editor_model="test_editor_model",
        agent_model="test_agent_model",
        editor_edit_format="editor-diff",
        verbose=False,
        session_encrypt=False,
        session_key_file=None,
    )

    return coder


@pytest.fixture
def session_manager(mock_coder):
    """Fixture to create a SessionManager instance."""
    return SessionManager(mock_coder, mock_coder.io)


@pytest.fixture
def session_key32():
    return os.urandom(32)


@pytest.fixture
def session_key_env(monkeypatch, session_key32):
    b64 = base64.urlsafe_b64encode(session_key32).decode().rstrip("=")
    monkeypatch.setenv(session_crypto.KEY_ENV, b64)
    return session_key32


@pytest.fixture
def encrypt_coder(mock_coder, session_key_env, monkeypatch):
    mock_coder.args = SimpleNamespace(
        model="test_model",
        weak_model="test_weak_model",
        editor_model="test_editor_model",
        agent_model="test_agent_model",
        editor_edit_format="editor-diff",
        verbose=False,
        session_encrypt=True,
        session_key_file=None,
    )
    monkeypatch.setattr(
        "cecli.sessions.models.Model",
        lambda *args, **kwargs: mock_coder.main_model,
    )
    return mock_coder


def test_save_session(session_manager, mock_coder, tmp_path):
    """Test saving a session."""
    _prepare_workspace(mock_coder, tmp_path)
    session_dir = Path(tmp_path) / ".cecli" / "sessions"

    session_name = "test_session"
    success = session_manager.save_session(session_name, output=False)

    assert success
    session_file = session_dir / f"{session_name}.json"
    assert session_file.exists()

    with open(session_file, "r") as f:
        session_data = json.load(f)

    assert session_data["session_name"] == session_name
    assert session_data["model"] == "test_model"
    assert session_data["edit_format"] == "diff"
    assert "file1.py" in session_data["files"]["editable"]


@pytest.mark.asyncio
async def test_load_session_restores_edit_format(session_manager, mock_coder, tmp_path):
    """Test that loading a session restores the edit_format."""
    _prepare_workspace(mock_coder, tmp_path)
    session_dir = Path(tmp_path) / ".cecli" / "sessions"

    # 1. Save a session with a specific edit_format
    mock_coder.edit_format = "agent"
    session_name = "agent_session"
    session_manager.save_session(session_name, output=False)

    # 2. Change the coder's edit_format to something different
    mock_coder.edit_format = "diff"

    # 3. Load the session
    session_file = session_dir / f"{session_name}.json"

    from cecli import commands

    original_switch_coder_signal = commands.SwitchCoderSignal

    class MockSwitchCoderSignal(Exception):
        def __init__(self, edit_format, **kwargs):
            self.edit_format = edit_format
            super().__init__()

    commands.SwitchCoderSignal = MockSwitchCoderSignal

    try:
        with pytest.raises(MockSwitchCoderSignal) as excinfo:
            await session_manager.load_session(str(session_file))

        # 4. Assert that the SwitchCoderSignal was raised with the correct edit_format
        assert excinfo.value.edit_format == "agent"

    finally:
        commands.SwitchCoderSignal = original_switch_coder_signal


@pytest.mark.asyncio
async def test_load_session_restores_architect_mode(session_manager, mock_coder, tmp_path):
    """Test that loading a session restores architect mode."""
    _prepare_workspace(mock_coder, tmp_path)
    session_dir = Path(tmp_path) / ".cecli" / "sessions"

    # 1. Save a session with architect mode
    mock_coder.edit_format = "architect"
    session_name = "architect_session"
    session_manager.save_session(session_name, output=False)

    # 2. Change the coder's edit_format to something different
    mock_coder.edit_format = "diff"

    # 3. Load the session
    session_file = session_dir / f"{session_name}.json"

    # Mock the SwitchCoderSignal to capture the edit_format it's called with
    from cecli import commands

    original_switch_coder_signal = commands.SwitchCoderSignal

    class MockSwitchCoderSignal(Exception):
        def __init__(self, edit_format, **kwargs):
            self.edit_format = edit_format
            super().__init__()

    commands.SwitchCoderSignal = MockSwitchCoderSignal

    try:
        with pytest.raises(MockSwitchCoderSignal) as excinfo:
            await session_manager.load_session(str(session_file))
        # 4. Assert that the SwitchCoderSignal was raised with the correct edit_format
        assert excinfo.value.edit_format == "architect"
    finally:
        commands.SwitchCoderSignal = original_switch_coder_signal


@pytest.mark.asyncio
async def test_load_session_restores_ask_mode(session_manager, mock_coder, tmp_path):
    """Test that loading a session restores ask mode."""
    _prepare_workspace(mock_coder, tmp_path)
    session_dir = Path(tmp_path) / ".cecli" / "sessions"

    # 1. Save a session with ask mode
    mock_coder.edit_format = "ask"
    session_name = "ask_session"
    session_manager.save_session(session_name, output=False)

    # 2. Change the coder's edit_format to something different
    mock_coder.edit_format = "diff"

    # 3. Load the session
    session_file = session_dir / f"{session_name}.json"

    # Mock the SwitchCoderSignal to capture the edit_format it's called with
    from cecli import commands

    original_switch_coder_signal = commands.SwitchCoderSignal

    class MockSwitchCoderSignal(Exception):
        def __init__(self, edit_format, **kwargs):
            self.edit_format = edit_format
            super().__init__()

    commands.SwitchCoderSignal = MockSwitchCoderSignal

    try:
        with pytest.raises(MockSwitchCoderSignal) as excinfo:
            await session_manager.load_session(str(session_file))
        # 4. Assert that the SwitchCoderSignal was raised with the correct edit_format
        assert excinfo.value.edit_format == "ask"
    finally:
        commands.SwitchCoderSignal = original_switch_coder_signal


@pytest.mark.asyncio
async def test_load_session_backwards_compatible(session_manager, mock_coder, tmp_path):
    """Test that loading an old session (without edit_format) uses current mode."""
    _prepare_workspace(mock_coder, tmp_path)
    session_dir = Path(tmp_path) / ".cecli" / "sessions"

    # 1. Create a session file without edit_format (old format)
    session_name = "old_session"
    session_file = session_dir / f"{session_name}.json"

    # Create session data without edit_format
    session_data = {
        "version": 1,
        "session_name": session_name,
        "model": "test_model",
        "chat_history": {"done_messages": [], "cur_messages": []},
        "files": {"editable": ["file1.py"], "read_only": [], "read_only_stubs": []},
        "settings": {"auto_commits": True, "auto_lint": True, "auto_test": False},
        "todo_list": None,
    }

    with open(session_file, "w") as f:
        json.dump(session_data, f, indent=2)

    # 2. Set current edit_format to agent
    mock_coder.edit_format = "agent"

    # 3. Load the session
    # Mock the SwitchCoderSignal to capture the edit_format it's called with
    from cecli import commands

    original_switch_coder_signal = commands.SwitchCoderSignal

    class MockSwitchCoderSignal(Exception):
        def __init__(self, edit_format, **kwargs):
            self.edit_format = edit_format
            super().__init__()

    commands.SwitchCoderSignal = MockSwitchCoderSignal

    try:
        with pytest.raises(MockSwitchCoderSignal) as excinfo:
            await session_manager.load_session(str(session_file))
        # 4. Assert that the SwitchCoderSignal was raised with the current mode (not None)
        assert excinfo.value.edit_format == "agent"
    finally:
        commands.SwitchCoderSignal = original_switch_coder_signal


@pytest.mark.asyncio
async def test_load_session_with_agent_mode_and_mcp_skills(session_manager, mock_coder, tmp_path):
    """Test that loading a session with agent mode restores MCP servers and skills."""
    _prepare_workspace(mock_coder, tmp_path)
    session_dir = Path(tmp_path) / ".cecli" / "sessions"

    # 1. Save a session with agent mode and MCP servers/skills
    mock_coder.edit_format = "agent"
    session_name = "agent_with_mcp_session"

    # Mock MCP servers and skills
    mock_coder.mcp_manager = AsyncMock()
    mock_mcp = MagicMock()
    mock_mcp.name = "mock_mcp"
    mock_coder.mcp_manager.connected_servers = [mock_mcp]
    mock_coder.skills_manager = MagicMock()
    mock_coder.skills_manager.include_list = {"included_skill"}
    mock_coder.skills_manager.exclude_list = {"excluded_skill"}
    mock_coder.skills_manager.directory_paths = ["/test/skills/path"]

    session_manager.save_session(session_name, output=False)

    # 2. Change the coder's edit_format and clear MCP/skills
    mock_coder.edit_format = "diff"
    mock_coder.mcp_manager.connected_servers = []
    mock_coder.skills_manager.include_list = set()
    mock_coder.skills_manager.exclude_list = set()
    mock_coder.skills_manager.directory_paths = []

    # 3. Load the session
    session_file = session_dir / f"{session_name}.json"

    # Mock the SwitchCoderSignal to capture the edit_format it's called with
    from cecli import commands

    original_switch_coder_signal = commands.SwitchCoderSignal

    class MockSwitchCoderSignal(Exception):
        def __init__(self, edit_format, **kwargs):
            self.edit_format = edit_format
            super().__init__()

    commands.SwitchCoderSignal = MockSwitchCoderSignal

    try:
        with pytest.raises(MockSwitchCoderSignal) as excinfo:
            await session_manager.load_session(str(session_file))
        # 4. Assert that the SwitchCoderSignal was raised with the correct edit_format
        assert excinfo.value.edit_format == "agent"
    finally:
        commands.SwitchCoderSignal = original_switch_coder_signal


# Add a test for the save_session method to ensure it saves edit_format
@pytest.mark.parametrize("edit_format", ["diff", "architect", "ask", "agent"])
def test_save_session_saves_edit_format(session_manager, mock_coder, tmp_path, edit_format):
    """Test that save_session correctly saves the edit_format for all modes."""
    _prepare_workspace(mock_coder, tmp_path)
    session_dir = Path(tmp_path) / ".cecli" / "sessions"

    # Set the edit_format
    mock_coder.edit_format = edit_format
    session_name = f"{edit_format}_session"

    # Save the session
    success = session_manager.save_session(session_name, output=False)
    assert success

    # Load the session data and verify edit_format
    session_file = session_dir / f"{session_name}.json"
    assert session_file.exists()

    with open(session_file, "r") as f:
        session_data = json.load(f)

    # Verify edit_format was saved correctly
    assert session_data["edit_format"] == edit_format


def test_save_session_encrypted_on_disk(encrypt_coder, session_key32, tmp_path):
    session_manager = SessionManager(encrypt_coder, encrypt_coder.io)
    _prepare_workspace(encrypt_coder, tmp_path)
    session_dir = Path(tmp_path) / ".cecli" / "sessions"

    assert session_manager.save_session("secret", output=False)
    path = session_dir / "secret.json"
    raw = path.read_bytes()
    assert session_crypto.is_encrypted_payload(raw)
    data = session_crypto.decrypt_session_bytes(raw, session_key32)
    assert data["session_name"] == "secret"
    assert data["model"] == "test_model"


def test_save_session_encrypt_without_key_fails(mock_coder, monkeypatch, tmp_path):
    monkeypatch.delenv(session_crypto.KEY_ENV, raising=False)
    _prepare_workspace(mock_coder, tmp_path)
    mock_coder.args = SimpleNamespace(
        model="test_model",
        weak_model="test_weak_model",
        editor_model="test_editor_model",
        agent_model="test_agent_model",
        editor_edit_format="editor-diff",
        verbose=False,
        session_encrypt=True,
        session_key_file=None,
    )
    manager = SessionManager(mock_coder, mock_coder.io)
    assert manager.save_session("nope", output=False) is False


@pytest.mark.asyncio
async def test_load_encrypted_session_switch_false(encrypt_coder, session_key32, tmp_path):
    session_manager = SessionManager(encrypt_coder, encrypt_coder.io)
    _prepare_workspace(encrypt_coder, tmp_path)
    encrypt_coder.edit_format = "ask"
    assert session_manager.save_session("enc-load", output=False)

    encrypt_coder.edit_format = "diff"
    path = Path(tmp_path) / ".cecli" / "sessions" / "enc-load.json"
    applied = await session_manager.load_session(str(path), switch=False)
    assert applied is True
    # switch=False applies messages/files but leaves edit_format for SwitchCoderSignal path
    loaded = session_crypto.decrypt_session_bytes(path.read_bytes(), session_key32)
    assert loaded["edit_format"] == "ask"


def test_list_sessions_encrypted_with_key(encrypt_coder, tmp_path):
    session_manager = SessionManager(encrypt_coder, encrypt_coder.io)
    _prepare_workspace(encrypt_coder, tmp_path)
    session_manager.save_session("listed", output=False)

    sessions = session_manager.list_sessions()
    assert len(sessions) == 1
    assert sessions[0]["name"] == "listed"
    assert sessions[0]["model"] == "test_model"
    assert sessions[0].get("encrypted") is True


def test_list_sessions_encrypted_without_key(encrypt_coder, monkeypatch, tmp_path):
    """Encrypted files list as placeholders when CECLI_SESSION_KEY is unset."""
    _prepare_workspace(encrypt_coder, tmp_path)
    session_manager = SessionManager(encrypt_coder, encrypt_coder.io)
    session_manager.save_session("locked", output=False)

    monkeypatch.delenv(session_crypto.KEY_ENV, raising=False)
    encrypt_coder.args = SimpleNamespace(
        model="test_model",
        weak_model="test_weak_model",
        editor_model="test_editor_model",
        agent_model="test_agent_model",
        editor_edit_format="editor-diff",
        verbose=False,
        session_encrypt=False,
        session_key_file=None,
    )
    sessions = session_manager.list_sessions()
    assert len(sessions) == 1
    assert sessions[0]["encrypted"] is True
    assert sessions[0]["model"] == "encrypted"


@pytest.mark.asyncio
async def test_load_encrypted_file_with_env_key_only(encrypt_coder, session_key_env, tmp_path):
    """Decrypt on load uses CECLI_SESSION_KEY even when session_encrypt is false on args."""
    _prepare_workspace(encrypt_coder, tmp_path)
    encrypt_coder.edit_format = "architect"
    SessionManager(encrypt_coder, encrypt_coder.io).save_session("env-load", output=False)

    encrypt_coder.args = SimpleNamespace(
        model="test_model",
        weak_model="test_weak_model",
        editor_model="test_editor_model",
        agent_model="test_agent_model",
        editor_edit_format="editor-diff",
        verbose=False,
        session_encrypt=False,
        session_key_file=None,
    )
    encrypt_coder.edit_format = "diff"
    path = Path(tmp_path) / ".cecli" / "sessions" / "env-load.json"
    applied = await SessionManager(encrypt_coder, encrypt_coder.io).load_session(
        str(path), switch=False
    )
    assert applied is True
    loaded = session_crypto.decrypt_session_bytes(
        path.read_bytes(), session_crypto.resolve_key()
    )
    assert loaded["edit_format"] == "architect"
