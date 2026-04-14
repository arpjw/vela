content = open('state/src/manager.rs').read()

extra = '''
    pub fn take_snapshot(&self) -> Vec<(Vec<u8>, Vec<u8>)> {
        self.mpt.snapshot_all()
    }

    pub fn commit_full(&mut self, _pre_snapshot: Vec<(Vec<u8>, Vec<u8>)>) -> crate::mpt::Hash {
        self.cache.set_sequence(self.batch_sequence + 1);
        let root = self.cache.commit_to_mpt(&mut self.mpt);
        self.batch_sequence += 1;
        if let Err(e) = self.persist_snapshot() {
            eprintln!("snapshot persist error: {}", e);
        }
        self.pending_batch.clear();
        root
    }
'''

insert_before = '\n    pub fn current_root'
content = content.replace(insert_before, extra + insert_before)
open('state/src/manager.rs', 'w').write(content)
print('patched')
