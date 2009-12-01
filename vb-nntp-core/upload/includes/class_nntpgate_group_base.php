<?php
abstract class NNTPGate_Group_Base
{

    protected $_db;
    protected $_group_id;
    protected $_map_id;

    public function  __construct($db = null)
    {
        if (! is_null ($db))
        {
            $this->_db = $db;
        }
        else
        {
            global $vbulletin;
            $this->_db =& $vbulletin->db;
        }

    }

    public function update_group_info($fields, $group_id = null)
    {
        if (is_null($group_id))
        {
            $group_id = $this->_group_id;
        }
        $set_fields = array();
        foreach ($fields as $field=>$value)
        {
            $set_fields[] = '`' . $field .'` = '. $value;
        }
        if (!empty($set_fields))
        {
            $sql = "UPDATE
                        `" . TABLE_PREFIX . "nntp_index`
                    SET
                        " . implode( ", ", $set_fields ) . "
                    WHERE
                        `groupid` = " . $group_id;
            $db->query_write($sql);
        }
    }

    public function delete_group ( $group_id = null)
    {
        if (is_null($group_id))
        {
            $group_id = $this->_group_id;
        }
        if (! $group_id)
        {
            return false;
        }
        $sql = "DELETE FROM
                    `" . TABLE_PREFIX . "nntp_index`
                WHERE
                    `groupid` = " . (int) $group_id;
        $this->_db->query_write($sql);
        $sql = "DELETE FROM
                    `" . TABLE_PREFIX . "nntp_groups`
                WHERE
                    `id` = " . (int) $group_id;
        $this->_db->query_write($sql);
        return true;
    }

    public function get_group_id_by_map_id($map_id = null, $external = false)
    {
        if (is_null($map_id))
        {
            $map_id = $this->_map_id;
        }
        if ( !$map_id)
        {
            return false;
        }
        // Find group id by map id
        $group_id = 0;
        $sql = "SELECT `id`
                FROM
                    `" . TABLE_PREFIX . "nntp_groups`
                WHERE
                    `map_id` =  " . $map_id;
        $res = $this->_db->query_first($sql);
        if( !empty( $res ) )
        {
            $group_id = intval($res['id']);
        }

        if ($external)
        {
            return $group_id;
        }
        else
        {
            return $this->_group_id = $group_id;
        }
    }
}
